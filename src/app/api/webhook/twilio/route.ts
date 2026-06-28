// ═══════════════════════════════════════════════════════════════════════════
// REFACTORED — Performance fix for 40+ second response times.
//
// BEFORE: Everything (DB + AI + send) ran sequentially before returning 200
//         to Twilio. Total: 40+ seconds. Twilio would retry, causing duplicates.
//
// AFTER:  Fast path (<500ms): parse → find tenant → verify sig → idempotency
//                              → return 200 to Twilio IMMEDIATELY
//         Background (after()): fire a single authenticated fetch to the
//                              Supabase Edge Function (process-message), which
//                              runs the full AI pipeline (contact upsert →
//                              conversation → AI → send) within Supabase's
//                              ~150s window instead of Vercel's 10s cap.
//
// The pipeline lives in exactly one place — the Edge Function — so the two
// copies can never drift. See supabase/functions/process-message/index.ts.
//
// Requires: experimental.after = true in next.config.ts (Next.js 15.1)
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { env } from '@/lib/env';
import { twilioService } from '@/lib/services/twilio';
import * as Sentry from '@sentry/nextjs';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twimlOk = () => new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });

// ─────────────────────────────────────────────────────────────────────────────
// FAST PATH — Returns 200 to Twilio in <500ms
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. Parse body
  const body = await request.text().catch(() => '');
  const params = new URLSearchParams(body);
  const webhookData: Record<string, string> = {};
  for (const [k, v] of params.entries()) webhookData[k] = v;

  const messageSid  = webhookData.MessageSid;
  const fromNumber  = webhookData.From;   // e.g. whatsapp:+2348012345678
  const toNumber    = webhookData.To;     // e.g. whatsapp:+14099083940
  const messageBody = webhookData.Body || '';

  if (!messageSid || !fromNumber || !toNumber) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
  }

  // 2. Find tenant by their WhatsApp number (single query — includes limits data)
  const cleanTo = toNumber.replace('whatsapp:', '');
  // Cast needed because supabaseAdmin is untyped (no Database generic) — columns are valid
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, twilio_auth_token, subscription_status, subscription_tier, ' +
      'trial_end_date, trial_conversation_limit, monthly_conversation_limit, trial_start_date'
    )
    .eq('twilio_whatsapp_number', cleanTo)
    .maybeSingle() as unknown as { data: TenantLimits | null; error: null };

  if (!tenantRow) {
    console.warn(`[Webhook] No tenant for number: ${cleanTo}`);
    return twimlOk();
  }

  const tenantId = tenantRow.id;

  // 3. Verify Twilio signature using the tenant's own auth token
  const signature  = request.headers.get('x-twilio-signature') || '';
  const webhookUrl = env.TWILIO_WEBHOOK_URL || request.url;

  if (tenantRow.twilio_auth_token) {
    const isValid = twilioService.verifyWebhookSignatureWithToken(
      signature, webhookUrl, webhookData, tenantRow.twilio_auth_token
    );
    if (!isValid) {
      console.error(`[Webhook] Invalid Twilio signature for tenant ${tenantId}`);
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 403 });
    }
  } else {
    // No stored token yet — log only, don't reject (tenant may still be onboarding)
    console.warn(`[Webhook] Tenant ${tenantId} has no twilio_auth_token — skipping sig verify`);
  }

  // 4. Idempotency: skip if this MessageSid was already processed
  const { data: existing } = await supabaseAdmin
    .from('webhook_events')
    .select('id, processed')
    .eq('event_type', 'inbound_message')
    .ilike('payload->>messageSid', messageSid)
    .maybeSingle();

  if (existing?.processed) {
    return twimlOk();
  }

  // 5. Hand the heavy work to the Supabase Edge Function AFTER the response is
  //    sent to Twilio. A single authenticated fetch is all we do here — the
  //    Edge Function stores the webhook_events row and runs the AI pipeline.
  after(async () => {
    try {
      const res = await fetch(env.SUPABASE_EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.EDGE_FUNCTION_SECRET}`,
          'Content-Type': 'application/json',
          // Run the function in the same region as the Supabase DB so its many
          // DB round-trips are local (otherwise it runs near Vercel/us-east-1
          // while the DB is in ap-southeast-2, adding ~200ms per query).
          ...(env.SUPABASE_EDGE_FUNCTION_REGION
            ? { 'x-region': env.SUPABASE_EDGE_FUNCTION_REGION }
            : {}),
        },
        // Matches the Edge Function's InboundPayload interface.
        body: JSON.stringify({
          tenantId,
          tenantLimits: tenantRow,
          messageSid,
          fromNumber,
          toNumber,
          messageBody,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Edge Function responded ${res.status}: ${await res.text().catch(() => '')}`
        );
      }
    } catch (err) {
      console.error('[Webhook] Failed to invoke Edge Function:', err);
      Sentry.captureException(err, { tags: { component: 'twilio-webhook-edge-invoke' } });
    }
  });

  // ── Return 200 to Twilio IMMEDIATELY ──────────────────────────────────────
  console.log(`[Webhook] Acked in ${Date.now() - startTime}ms — AI processing in background`);
  return twimlOk();
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — shape of the tenant row forwarded to the Edge Function as tenantLimits
// ─────────────────────────────────────────────────────────────────────────────

interface TenantLimits {
  id: string;
  subscription_status: string;
  subscription_tier: string;
  trial_end_date: string | null;
  trial_conversation_limit: number | null;
  monthly_conversation_limit: number | null;
  trial_start_date: string | null;
  twilio_auth_token: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, company_name, twilio_whatsapp_number, subscription_status')
    .not('twilio_whatsapp_number', 'is', null);

  return NextResponse.json({
    status: 'healthy',
    service: 'twilio-webhook',
    architecture: 'after() — acks Twilio in <500ms, then invokes the Supabase Edge Function (process-message) which runs the AI pipeline',
    timestamp: new Date().toISOString(),
    configured_tenants: (tenants || []).map(t => ({
      id: t.id,
      company: t.company_name,
      whatsapp: t.twilio_whatsapp_number,
      subscription: t.subscription_status,
    })),
  });
}
