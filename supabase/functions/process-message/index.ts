// Supabase Edge Function: process-message
//
// Why this exists: Vercel Hobby's function execution is hard-capped at 10s,
// which regularly killed the AI pipeline (Claude call + tool use + Twilio send,
// ~6-9s) mid-flight when run via Next.js's after(). Supabase Edge Functions
// (free tier) give ~150s of wall-clock time, with EdgeRuntime.waitUntil()
// providing the same "ack fast, finish in background" pattern.
//
// The Next.js webhook route (src/app/api/webhook/twilio/route.ts) keeps doing
// the FAST path itself (parse, find tenant, verify signature, idempotency
// check — all well under 500ms) and then fires a single fetch to this
// function instead of using after(). This function acks immediately and runs
// the heavy lifting (contact/conversation upsert, AI agent, Twilio send) in
// the background via EdgeRuntime.waitUntil().
//
// IMPORTANT: polyfill.ts must be the first import — it sets globalThis.process
// so every ported file's `process.env.X` reads resolve via Deno.env.get().
import './_shared/polyfill.ts';

import { supabaseAdmin } from './_shared/db/client.ts';
import { twilioService } from './_shared/services/twilio.ts';
import { aiAgent } from './_shared/ai/agent.ts';
import { extractBudgetHints, extractTimelineHints } from './_shared/ai/auto-extract.ts';
import { getFirstGreeting } from './_shared/ai/prompt-simple.ts';

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

interface InboundPayload {
  tenantId: string;
  tenantLimits: TenantLimits;
  messageSid: string;
  fromNumber: string;
  toNumber: string;
  messageBody: string;
}

const UPGRADE_MESSAGE =
  'Your trial has ended or your conversation limit has been reached. ' +
  'Please upgrade your plan in the dashboard to continue using WhatsApp AI.';

Deno.serve(async (req: Request) => {
  // Simple shared-secret auth so this function can't be invoked by anyone
  // who finds the URL — only our own Next.js backend (and the keep-warm cron)
  // should call it. This gate applies to every method, including the GET
  // health ping, so there is no unauthenticated endpoint.
  const authHeader = req.headers.get('authorization') || '';
  const expected = `Bearer ${Deno.env.get('EDGE_FUNCTION_SECRET') || ''}`;
  if (!Deno.env.get('EDGE_FUNCTION_SECRET') || authHeader !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
  }

  // Keep-warm / health ping: an authenticated GET that boots the isolate
  // (compiling the static module graph) so real POSTs aren't cold. Does no
  // work and writes no logs — just a fast 200. A pg_cron job hits this every
  // minute (with x-region set) to keep the regional instance warm.
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, status: 'warm' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: InboundPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 });
  }

  if (!payload?.tenantId || !payload?.messageSid || !payload?.fromNumber || !payload?.toNumber) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), { status: 400 });
  }

  // Ack immediately, keep working in the background.
  // @ts-ignore - EdgeRuntime is a Supabase/Deno Deploy global, not in the TS lib defs
  EdgeRuntime.waitUntil(handleInboundMessage(payload));

  return new Response(JSON.stringify({ ok: true, accepted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function handleInboundMessage(payload: InboundPayload) {
  const { tenantId, tenantLimits, messageSid, fromNumber, toNumber, messageBody } = payload;
  const cleanFrom = fromNumber.replace('whatsapp:', '');

  // Lightweight stage timing to diagnose end-to-end latency.
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  try {
    // Store webhook event (mirrors the old after() callback's first step)
    await supabaseAdmin.from('webhook_events').insert({
      tenant_id: tenantId,
      source: 'twilio',
      event_type: 'inbound_message',
      payload: { messageSid, from: fromNumber, to: toNumber, body: messageBody, timestamp: new Date().toISOString() },
      processed: false,
    });

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
        console.error('[Edge:process-message] Failed to create contact:', contactErr);
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
        console.error('[Edge:process-message] Failed to create conversation:', convErr);
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

    console.log(`[Edge:timing] DB setup (contact/conversation/writes) ready in ${ms()}ms`);

    // 5. Fast regex extraction (no extra LLM call)
    try {
      const budgetHint = extractBudgetHints(messageBody);
      const timelineHint = extractTimelineHints(messageBody);
      const quickUpdates: Record<string, string> = {};
      if (budgetHint && !contact.budget_range) quickUpdates.budget_range = budgetHint;
      if (timelineHint && !contact.timeline) quickUpdates.timeline = timelineHint;
      if (Object.keys(quickUpdates).length > 0) {
        await supabaseAdmin.from('contacts').update(quickUpdates).eq('id', contact.id);
        contact = { ...contact, ...quickUpdates };
      }
    } catch {
      /* non-fatal */
    }

    // 6. Skip AI if a human has taken over
    if (['human-handling', 'human-handled', 'handoff-requested'].includes(conversation.status)) {
      console.log(`[Edge:process-message] Conv ${conversation.id} is ${conversation.status} — AI skipped, saved for human`);
      return;
    }

    // 7. AI response
    const aiStart = Date.now();
    try {
      const isFirstMessage = (conversation.message_count || 0) <= 1;

      if (isFirstMessage) {
        const { data: tenantData } = await supabaseAdmin
          .from('tenants')
          .select('ai_greeting, ai_assistant_name, company_name, agent_config')
          .eq('id', tenantId)
          .single();

        const greeting = getFirstGreeting(
          tenantData?.ai_greeting,
          tenantData?.company_name || 'Our Company',
          tenantData?.ai_assistant_name || 'Assistant',
          tenantData?.agent_config?.greeting_message
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
        console.log(`[Edge:process-message] Auto-greeting sent in ${Date.now() - aiStart}ms (total ${ms()}ms)`);
      } else {
        await aiAgent.processInboundMessage({
          tenantId,
          contactId: contact.id,
          conversationId: conversation.id,
          messageContent: messageBody,
          language: contact.language || 'en',
        });
        console.log(`[Edge:process-message] AI response sent in ${Date.now() - aiStart}ms (total ${ms()}ms)`);
      }
    } catch (aiErr) {
      console.error('[Edge:process-message] AI failed:', aiErr);

      try {
        await twilioService.sendWhatsAppMessage(
          tenantId,
          contact.whatsapp_number,
          "Thanks for your message! Our team will get back to you shortly.",
          { bypassRateLimit: true }
        );
      } catch {
        /* ignore */
      }
    }

    // 8. Mark webhook as processed
    await supabaseAdmin
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('event_type', 'inbound_message')
      .eq('processed', false)
      .ilike('payload->>messageSid', messageSid);

    console.log(`[Edge:timing] handleInboundMessage total ${ms()}ms`);
  } catch (err) {
    console.error('[Edge:process-message] Background processing failed:', err);
  }
}

async function checkTenantLimits(tenantId: string, t: TenantLimits, cleanNumber: string): Promise<boolean> {
  try {
    if (t.subscription_status === 'trial' && t.trial_end_date && new Date(t.trial_end_date) < new Date()) {
      await supabaseAdmin.from('tenants').update({ subscription_status: 'past_due' }).eq('id', tenantId);
      await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
      return false;
    }

    if (t.subscription_status === 'trial') {
      const trialLimit = t.trial_conversation_limit || 25;
      const trialStart = t.trial_start_date
        ? new Date(t.trial_start_date).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

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

    if (t.subscription_status === 'past_due') {
      await twilioService.sendWhatsAppMessage(tenantId, cleanNumber, UPGRADE_MESSAGE, { bypassRateLimit: true });
      return false;
    }

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
    console.error('[Edge:process-message] Limit check error (failing open):', err);
    return true;
  }
}
