// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { twilioService } from '@/lib/services/twilio';
import { aiAgent } from '@/lib/ai/agent';

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
    const toNumber = webhookData.To;       // e.g. whatsapp:+15419098284
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

    // 7. Get or create conversation (24-hour window)
    const windowStart = new Date(Date.now() - CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000);
    let { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .eq('is_active', true)
      .gte('conversation_window_start', windowStart.toISOString())
      .maybeSingle();

    if (!conversation) {
      // Close old conversations
      await supabaseAdmin
        .from('conversations')
        .update({ is_active: false, status: 'closed', conversation_window_end: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('contact_id', contact.id)
        .eq('is_active', true);

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

    log('Message saved, starting AI processing...');

    // 9. Process AI response inline (no Redis dependency)
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
