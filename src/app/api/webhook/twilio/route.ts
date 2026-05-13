// ═══════════════════════════════════════════════════════════════════════════
// REFACTORED — Performance fix for 40+ second response times.
//
// BEFORE: Everything (DB + AI + send) ran sequentially before returning 200
//         to Twilio. Total: 40+ seconds. Twilio would retry, causing duplicates.
//
// AFTER:  Fast path (<500ms): parse → find tenant → verify sig → idempotency
//                              → return 200 to Twilio IMMEDIATELY
//         Background (after()): contact upsert → conversation → AI → send
//                              Total: ~6-9 seconds for the customer's reply
//
// Requires: experimental.after = true in next.config.ts (Next.js 15.1)
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { env } from '@/lib/env';
import { twilioService } from '@/lib/services/twilio';
import { aiAgent } from '@/lib/ai/agent';
import { extractBudgetHints, extractTimelineHints } from '@/lib/ai/auto-extract';
import { getFirstGreeting } from '@/lib/ai/prompt-simple';
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

  // 5. Schedule all heavy work to run AFTER the response is sent to Twilio
  after(async () => {
    try {
      // Store webhook event
      await supabaseAdmin.from('webhook_events').insert({
        tenant_id: tenantId,
        source: 'twilio',
        event_type: 'inbound_message',
        payload: { messageSid, from: fromNumber, to: toNumber, body: messageBody, timestamp: new Date().toISOString() },
        processed: false,
      });

      await processInboundMessage(tenantId, tenantRow, { messageSid, fromNumber, toNumber, messageBody });
    } catch (err) {
      console.error('[Webhook] Background processing failed:', err);
      Sentry.captureException(err, { tags: { component: 'twilio-webhook-background' } });
    }
  });

  // ── Return 200 to Twilio IMMEDIATELY ──────────────────────────────────────
  console.log(`[Webhook] Acked in ${Date.now() - startTime}ms — AI processing in background`);
  return twimlOk();
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND PROCESSING (runs after response is sent)
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

async function processInboundMessage(
  tenantId: string,
  tenantLimits: TenantLimits,
  data: { messageSid: string; fromNumber: string; toNumber: string; messageBody: string }
) {
  const { messageSid, fromNumber, toNumber, messageBody } = data;
  const cleanFrom = fromNumber.replace('whatsapp:', '');

  // 1. Check limits before doing anything else
  const limitOk = await checkTenantLimits(tenantId, tenantLimits, cleanFrom);
  if (!limitOk) return;

  // 2. Get or create contact
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', cleanFrom)
    .maybeSingle();

  if (!contact) {
    const { data: newContact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        whatsapp_number: cleanFrom,
        temperature: 'new',
        lead_score: 0,
        qualification_status: 'unqualified',
        source: 'organic',
        first_message_at: new Date().toISOString(),
        metadata: { firstMessageTo: toNumber.replace('whatsapp:', '') },
      })
      .select()
      .single();

    if (contactErr || !newContact) {
      console.error('[Webhook] Failed to create contact:', contactErr);
      return;
    }
    contact = newContact;
  }

  // 3. Get or create conversation
  let { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contact.id)
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    // Close any orphaned open conversations
    await supabaseAdmin
      .from('conversations')
      .update({ is_active: false, status: 'closed', conversation_window_end: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .neq('status', 'closed');

    const { data: newConv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        conversation_window_start: new Date().toISOString(),
        is_active: true,
        status: 'active',
      })
      .select()
      .single();

    if (convErr || !newConv) {
      console.error('[Webhook] Failed to create conversation:', convErr);
      return;
    }
    conversation = newConv;
  } else if (!conversation.is_active) {
    await supabaseAdmin.from('conversations').update({ is_active: true }).eq('id', conversation.id);
    conversation = { ...conversation, is_active: true };
  }

  // 4. Parallel DB writes: save message + update contact + update conversation count
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from('messages').insert({
      conversation_id: conversation.id,
      tenant_id: tenantId,
      direction: 'inbound',
      sender_type: 'contact',
      content: messageBody,
      twilio_message_sid: messageSid,
      metadata: { from: fromNumber, to: toNumber },
    }),
    supabaseAdmin.from('contacts').update({
      last_message_at: now,
      ...(contact.first_message_at ? {} : { first_message_at: now }),
    }).eq('id', contact.id),
    supabaseAdmin.from('conversations').update({
      message_count: (conversation.message_count || 0) + 1,
      updated_at: now,
    }).eq('id', conversation.id),
  ]);

  // 5. Fast regex extraction (no extra LLM call — AI handles detailed extraction via tools)
  try {
    const budgetHint   = extractBudgetHints(messageBody);
    const timelineHint = extractTimelineHints(messageBody);
    const quickUpdates: Record<string, string> = {};
    if (budgetHint   && !contact.budget_range) quickUpdates.budget_range   = budgetHint;
    if (timelineHint && !contact.timeline)     quickUpdates.timeline = timelineHint;
    if (Object.keys(quickUpdates).length > 0) {
      await supabaseAdmin.from('contacts').update(quickUpdates).eq('id', contact.id);
      contact = { ...contact, ...quickUpdates };
    }
  } catch { /* non-fatal */ }

  // 6. Skip AI if a human has taken over
  if (['human-handling', 'human-handled', 'handoff-requested'].includes(conversation.status)) {
    console.log(`[Webhook] Conv ${conversation.id} is ${conversation.status} — AI skipped, saved for human`);
    return;
  }

  // 7. AI response
  try {
    const isFirstMessage = (conversation.message_count || 0) <= 1;

    if (isFirstMessage) {
      // First message: send custom greeting without AI overhead
      const { data: tenantData } = await supabaseAdmin
        .from('tenants')
        .select('ai_greeting, ai_assistant_name, company_name')
        .eq('id', tenantId)
        .single();

      const greeting = getFirstGreeting(
        tenantData?.ai_greeting,
        tenantData?.company_name || 'Our Company',
        tenantData?.ai_assistant_name || 'Assistant'
      );

      await Promise.all([
        supabaseAdmin.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          direction: 'outbound',
          sender_type: 'ai',
          content: greeting,
          ai_confidence: 1.0,
          metadata: { auto_greeting: true },
        }),
        twilioService.sendWhatsAppMessage(tenantId, contact.whatsapp_number, greeting),
      ]);
      console.log('[Webhook] ✅ Auto-greeting sent');
    } else {
      // Full AI processing for all subsequent messages
      await aiAgent.processInboundMessage({
        tenantId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageContent: messageBody,
        language: contact.language || 'en',
      });
      console.log('[Webhook] ✅ AI response sent');
    }
  } catch (aiErr) {
    console.error('[Webhook] AI failed:', aiErr);
    Sentry.captureException(aiErr, { tags: { component: 'twilio-webhook-ai' } });

    // Fallback so customer isn't left in silence
    try {
      await twilioService.sendWhatsAppMessage(
        tenantId,
        contact.whatsapp_number,
        "Thanks for your message! Our team will get back to you shortly.",
        { bypassRateLimit: true }
      );
    } catch { /* ignore */ }
  }

  // 8. Mark webhook as processed
  await supabaseAdmin
    .from('webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('event_type', 'inbound_message')
    .eq('processed', false)
    .ilike('payload->>messageSid', messageSid);
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT LIMIT ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

const UPGRADE_MESSAGE =
  'Your trial has ended or your conversation limit has been reached. ' +
  'Please upgrade your plan in the dashboard to continue using WhatsApp AI.';

async function checkTenantLimits(tenantId: string, t: TenantLimits, cleanNumber: string): Promise<boolean> {
  try {
    // Trial expired by date
    if (t.subscription_status === 'trial' && t.trial_end_date && new Date(t.trial_end_date) < new Date()) {
      await supabaseAdmin.from('tenants').update({ subscription_status: 'past_due' }).eq('id', tenantId);
      await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
      return false;
    }

    // Trial conversation count limit
    if (t.subscription_status === 'trial') {
      const trialLimit = t.trial_conversation_limit || 25;
      const trialStart = t.trial_start_date
        ? new Date(t.trial_start_date).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30d fallback, not epoch

      const { count } = await supabaseAdmin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', trialStart);

      if ((count || 0) >= trialLimit) {
        await supabaseAdmin.from('tenants').update({ subscription_status: 'past_due' }).eq('id', tenantId);
        await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
        return false;
      }
      return true;
    }

    // Past due
    if (t.subscription_status === 'past_due') {
      await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
      return false;
    }

    // Active subscription — check monthly limit
    const limit = t.monthly_conversation_limit ?? 0;
    if (limit > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabaseAdmin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart.toISOString());
      if ((count || 0) >= limit) {
        await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[Webhook] Limit check error (failing open):', err);
    return true; // fail open — never drop a message due to a limit-check bug
  }
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
    architecture: 'after() — acks Twilio in <500ms, processes AI in background',
    timestamp: new Date().toISOString(),
    configured_tenants: (tenants || []).map(t => ({
      id: t.id,
      company: t.company_name,
      whatsapp: t.twilio_whatsapp_number,
      subscription: t.subscription_status,
    })),
  });
}
