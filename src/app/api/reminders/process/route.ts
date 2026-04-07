/**
 * Appointment Reminder CRON Endpoint
 * Sends reminders 2 hours and 30 minutes before appointments.
 * Notifies both the lead (via WhatsApp) and the agent (via email/WhatsApp).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';

async function sendWhatsApp(tenantId: string, to: string, body: string): Promise<boolean> {
  try {
    const { data: t } = await supabaseAdmin.from('tenants').select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_number').eq('id', tenantId).single();
    if (!t?.twilio_account_sid || !t?.twilio_auth_token || !t?.twilio_whatsapp_number) return false;
    const twilio = require('twilio')(t.twilio_account_sid, t.twilio_auth_token);
    await twilio.messages.create({ from: `whatsapp:${t.twilio_whatsapp_number}`, to: `whatsapp:${to}`, body });
    return true;
  } catch (err) { console.error('[Reminder] Send failed:', err); return false; }
}

// Vercel CRONs send GET requests
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 10 * 60 * 1000); // 2h10m
    const twoHoursExact = new Date(now.getTime() + 2 * 60 * 60 * 1000 - 10 * 60 * 1000);   // 1h50m
    const thirtyMinFromNow = new Date(now.getTime() + 40 * 60 * 1000); // 40min
    const thirtyMinExact = new Date(now.getTime() + 20 * 60 * 1000);   // 20min

    // Find appointments needing 2-hour reminder
    const { data: twoHrAppts } = await supabaseAdmin
      .from('appointments')
      .select('*, contacts(name, whatsapp_number), tenants(company_name, agent_display_name, timezone, handoff_settings)')
      .eq('status', 'scheduled')
      .gte('scheduled_time', twoHoursExact.toISOString())
      .lte('scheduled_time', twoHoursFromNow.toISOString());

    // Find appointments needing 30-min reminder
    const { data: thirtyMinAppts } = await supabaseAdmin
      .from('appointments')
      .select('*, contacts(name, whatsapp_number), tenants(company_name, agent_display_name, timezone, handoff_settings)')
      .eq('status', 'scheduled')
      .gte('scheduled_time', thirtyMinExact.toISOString())
      .lte('scheduled_time', thirtyMinFromNow.toISOString());

    let sent = 0;

    // Process 2-hour reminders
    for (const appt of (twoHrAppts || [])) {
      // Check if already reminded
      const { data: existing } = await supabaseAdmin.from('appointment_reminders').select('id').eq('appointment_id', appt.id).eq('reminder_type', '2_hours').limit(1);
      if (existing && existing.length > 0) continue;

      const contact = appt.contacts;
      const tenant = appt.tenants;
      const agentName = tenant?.agent_display_name || 'our team';
      const time = new Date(appt.scheduled_time).toLocaleString('en-US', {
        timeZone: tenant?.timezone || 'UTC', hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short', month: 'short', day: 'numeric'
      });

      // Send to lead
      const leadMsg = `Hi ${contact?.name || 'there'}! Just a reminder: your property viewing is in about 2 hours at ${time}. ${agentName} will be meeting you. See you soon!`;
      const leadOk = await sendWhatsApp(appt.tenant_id, contact?.whatsapp_number, leadMsg);

      // Record reminder
      await supabaseAdmin.from('appointment_reminders').insert([
        { tenant_id: appt.tenant_id, appointment_id: appt.id, reminder_type: '2_hours', recipient_type: 'lead', scheduled_for: now.toISOString(), message_content: leadMsg, status: leadOk ? 'sent' : 'failed', sent_at: leadOk ? now.toISOString() : null },
      ]);

      // Notify agent via handoff WhatsApp if configured
      const agentPhone = tenant?.handoff_settings?.recipients?.whatsapp;
      if (agentPhone) {
        const agentMsg = `Reminder: You have a viewing at ${time} with ${contact?.name || 'a client'} (${contact?.whatsapp_number}). Notes: ${appt.notes || 'None'}`;
        await sendWhatsApp(appt.tenant_id, agentPhone, agentMsg);
        await supabaseAdmin.from('appointment_reminders').insert({ tenant_id: appt.tenant_id, appointment_id: appt.id, reminder_type: '2_hours', recipient_type: 'agent', scheduled_for: now.toISOString(), message_content: agentMsg, status: 'sent', sent_at: now.toISOString() });
      }
      sent++;
    }

    // Process 30-min reminders
    for (const appt of (thirtyMinAppts || [])) {
      const { data: existing } = await supabaseAdmin.from('appointment_reminders').select('id').eq('appointment_id', appt.id).eq('reminder_type', '30_minutes').limit(1);
      if (existing && existing.length > 0) continue;

      const contact = appt.contacts;
      const tenant = appt.tenants;
      const agentName = tenant?.agent_display_name || 'our team';

      const leadMsg = `Almost time! Your viewing with ${agentName} starts in about 30 minutes. See you shortly!`;
      const leadOk = await sendWhatsApp(appt.tenant_id, contact?.whatsapp_number, leadMsg);
      await supabaseAdmin.from('appointment_reminders').insert({ tenant_id: appt.tenant_id, appointment_id: appt.id, reminder_type: '30_minutes', recipient_type: 'lead', scheduled_for: now.toISOString(), message_content: leadMsg, status: leadOk ? 'sent' : 'failed', sent_at: leadOk ? now.toISOString() : null });
      sent++;
    }

    console.log(`[Reminders] Sent ${sent} reminders`);
    return NextResponse.json({ sent, twoHr: twoHrAppts?.length || 0, thirtyMin: thirtyMinAppts?.length || 0 });
  } catch (err) {
    console.error('[Reminders] Error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
