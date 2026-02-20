// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { twilioService } from '@/lib/services/twilio';
import { aiAgent } from '@/lib/ai/agent';
import { autoExtractAndSave, extractBudgetHints, extractTimelineHints } from '@/lib/ai/auto-extract';

const CONVERSATION_WINDOW_HOURS = 24;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logs: string[] = [];
  const log = (msg: string) => { console.log(`[Twilio WH] ${msg}`); logs.push(msg); };
  const logErr = (msg: string, err?: any) => { console.error(`[Twilio WH] ${msg}`, err || ''); logs.push(`ERROR: ${msg}`); };

  try {
    // 1. Parse body
    const body = await request.text();
    const params = new URLSearchParams(body);
    const webhookData: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      webhookData[key] = value;
    }

    const messageSid = webhookData.MessageSid;
    const fromNumber = webhookData.From;   // e.g. whatsapp:+1234567890
    const toNumber = webhookData.To;       // e.g. whatsapp:+14099083940
    const messageBody = webhookData.Body || '';

    log(`Received: from=${fromNumber} to=${toNumber} body="${messageBody.substring(0, 50)}" sid=${messageSid}`);

    // 2. Skip signature verification for now — production URL behind proxy
    //    causes mismatch with Twilio's computed signature. TODO: use TWILIO_WEBHOOK_URL env var.
    
    // 3. Find tenant by WhatsApp number
    const tenantId = await twilioService.getTenantByWhatsAppNumber(toNumber);
    if (!tenantId) {
      logErr(`No tenant found for WhatsApp number: ${toNumber}`);
      return NextResponse.json({ ok: false, error: 'No tenant', logs }, { status: 200 });
    }
    log(`Tenant found: ${tenantId}`);

    // 3b. Trial & limit check
    const limitOk = await checkTenantLimits(tenantId, fromNumber, log);
    if (!limitOk) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // 4. Idempotency check — use MessageSid as TEXT (not UUID)
    const { data: existing } = await supabaseAdmin
      .from('webhook_events')
      .select('id, processed')
      .eq('event_type', 'inbound_message')
      .ilike('payload->>messageSid', messageSid)
      .maybeSingle();

    if (existing?.processed) {
      log(`Already processed: ${messageSid}`);
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // 5. Store webhook event (use auto-generated UUID for idempotency_key)
    const { error: insertErr } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        tenant_id: tenantId,
        source: 'twilio',
        event_type: 'inbound_message',
        payload: {
          messageSid,
          from: fromNumber,
          to: toNumber,
          body: messageBody,
          timestamp: new Date().toISOString(),
        },
        processed: false,
      });
    if (insertErr) logErr('Failed to store webhook event', insertErr);

    // 6. Get or create contact
    const cleanFrom = fromNumber.replace('whatsapp:', '');
    let { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', cleanFrom)
      .maybeSingle();

    if (!contact) {
      log(`Creating new contact: ${cleanFrom}`);
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
      if (contactErr) { logErr('Failed to create contact', contactErr); throw contactErr; }
      contact = newContact;
    }
    log(`Contact: ${contact.id} (${contact.name || cleanFrom})`);

    // 7. Get or create conversation — find most recent non-closed conv (works for old records without is_active set)
    let { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversation && !conversation.is_active) {
      // Repair: ensure is_active is set on the found conversation
      await supabaseAdmin.from('conversations').update({ is_active: true }).eq('id', conversation.id);
      conversation = { ...conversation, is_active: true };
    }

    if (!conversation) {
      // Close old conversations
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
      if (convErr) { logErr('Failed to create conversation', convErr); throw convErr; }
      conversation = newConv;
      log(`New conversation: ${conversation.id}`);
    } else {
      log(`Existing conversation: ${conversation.id}`);
    }

    // 8. Save inbound message
    const { error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        tenant_id: tenantId,
        direction: 'inbound',
        sender_type: 'contact',
        content: messageBody,
        twilio_message_sid: messageSid,
        metadata: { from: fromNumber, to: toNumber },
      });
    if (msgErr) logErr('Failed to save message', msgErr);

    // 🎯 AUTO-EXTRACT DATA (safety net for when AI fails to call update_lead)
    log('Running auto-extraction...');
    try {
      const extractionResult = await autoExtractAndSave(contact.id, messageBody, contact);
      if (extractionResult.hasChanges) {
        log(`Auto-extracted: ${JSON.stringify(extractionResult)}`);
        // Refresh contact data if we extracted new info
        const { data: updatedContact } = await supabaseAdmin
          .from('contacts')
          .select('*')
          .eq('id', contact.id)
          .single();
        if (updatedContact) contact = updatedContact;
      }

      // Extract budget/timeline hints for scoring
      const budgetHint = extractBudgetHints(messageBody);
      const timelineHint = extractTimelineHints(messageBody);
      const metadataUpdates: any = {};
      
      if (budgetHint && !contact.budget_range) {
        metadataUpdates.budget_range = budgetHint;
        log(`Auto-extracted budget: ${budgetHint}`);
      }
      if (timelineHint && !contact.timeline) {
        metadataUpdates.timeline = timelineHint;
        log(`Auto-extracted timeline: ${timelineHint}`);
      }

      if (Object.keys(metadataUpdates).length > 0) {
        await supabaseAdmin
          .from('contacts')
          .update(metadataUpdates)
          .eq('id', contact.id);
      }
    } catch (extractErr) {
      logErr('Auto-extraction failed (non-fatal)', extractErr);
    }

    // Update contact timestamps
    await supabaseAdmin
      .from('contacts')
      .update({
        last_message_at: new Date().toISOString(),
        ...(contact.first_message_at ? {} : { first_message_at: new Date().toISOString() }),
      })
      .eq('id', contact.id);

    // Update conversation message count
    await supabaseAdmin
      .from('conversations')
      .update({ message_count: (conversation.message_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    log('Message saved, checking conversation status...');

    // 9. Skip AI if a human agent has taken over
    if (conversation.status === 'human-handling' || conversation.status === 'human-handled') {
      log(`Conversation is ${conversation.status} — skipping AI, message saved for human agent`);
    } else {
      // 10. Process AI response inline (no Redis dependency)
      log('Starting AI processing...');
      try {
        const language = contact.language || 'en';
        await aiAgent.processInboundMessage({
          tenantId,
          contactId: contact.id,
          conversationId: conversation.id,
          messageContent: messageBody,
          language,
        });
        log('AI response sent successfully');
      } catch (aiErr) {
        logErr('AI processing failed', aiErr);
        // Send fallback message so customer isn't left hanging
        try {
          await twilioService.sendWhatsAppMessage(
            tenantId,
            contact.whatsapp_number,
            "Thanks for your message! Our team will get back to you shortly.",
            { bypassRateLimit: true }
          );
          log('Fallback message sent');
        } catch (fallbackErr) {
          logErr('Fallback message also failed', fallbackErr);
        }
      }
    }

    // 10. Mark webhook as processed
    if (!insertErr) {
      await supabaseAdmin
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('event_type', 'inbound_message')
        .eq('processed', false)
        .ilike('payload->>messageSid', messageSid);
    }

    const processingTime = Date.now() - startTime;
    log(`Done in ${processingTime}ms`);

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  } catch (error) {
    logErr('Unhandled error', error);
    // Return 200 to prevent Twilio retries, but include debug info
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error', logs },
      { status: 200 }
    );
  }
}

// Health check + debug endpoint
export async function GET() {
  // Quick check: list tenants with WhatsApp numbers configured
  let tenants: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id, company_name, twilio_whatsapp_number, subscription_status')
      .not('twilio_whatsapp_number', 'is', null);
    tenants = data || [];
  } catch (e) {
    // ignore
  }

  return NextResponse.json({
    status: 'healthy',
    service: 'twilio-webhook',
    timestamp: new Date().toISOString(),
    configured_tenants: tenants.map(t => ({
      id: t.id,
      company: t.company_name,
      whatsapp: t.twilio_whatsapp_number,
      subscription: t.subscription_status,
    })),
  });
}

async function checkTenantLimits(tenantId: string, fromNumber: string, log: (msg: string) => void): Promise<boolean> {
  try {
    const { data: t } = await supabaseAdmin.from('tenants').select('subscription_tier, subscription_status, trial_end_date, trial_conversation_limit, monthly_conversation_limit').eq('id', tenantId).single();
    if (!t) return true;

    if (t.subscription_status === 'trial' && t.trial_end_date && new Date(t.trial_end_date) < new Date()) {
      log('Trial expired');
      await twilioService.sendWhatsAppMessage(tenantId, fromNumber.replace('whatsapp:', ''), "Thanks for your message! This business is currently updating their system. Please try again later.", { bypassRateLimit: true });
      return false;
    }

    const tierLimits: Record<string, number> = { free: 25, starter: 200, growth: 800, scale: 2500 };
    const limit = t.subscription_status === 'trial' ? (t.trial_conversation_limit || 25) : (t.monthly_conversation_limit || tierLimits[t.subscription_tier] || 200);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const { count } = await supabaseAdmin.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', monthStart.toISOString());
    const usage = count || 0;

    if (usage >= limit) {
      log(`Limit reached: ${usage}/${limit}`);
      await twilioService.sendWhatsAppMessage(tenantId, fromNumber.replace('whatsapp:', ''), "Thanks for your message! We're experiencing high demand. Our team will get back to you soon.", { bypassRateLimit: true });
      return false;
    }
    log(`Usage: ${usage}/${limit} (${t.subscription_tier})`);
    return true;
  } catch (err) {
    log(`Limit check error: ${err}`);
    return true;
  }
}
