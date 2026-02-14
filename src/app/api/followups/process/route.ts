// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';

function isWithinSendWindow(tz: string): boolean {
  try {
    const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()), 10);
    return h >= 9 && h < 12;
  } catch { return true; }
}

async function sendWhatsApp(tenantId: string, to: string, body: string): Promise<boolean> {
  try {
    const { data: t } = await supabaseAdmin.from('tenants').select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_number').eq('id', tenantId).single();
    if (!t?.twilio_account_sid || !t?.twilio_auth_token || !t?.twilio_whatsapp_number) return false;
    const twilio = require('twilio')(t.twilio_account_sid, t.twilio_auth_token);
    await twilio.messages.create({ from: `whatsapp:${t.twilio_whatsapp_number}`, to: `whatsapp:${to}`, body });
    return true;
  } catch (err) { console.error('[FollowUp] Send failed:', err); return false; }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: pending, error } = await supabaseAdmin
      .from('scheduled_followups')
      .select('*, contacts(whatsapp_number, name, temperature), tenants(timezone)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (error || !pending) return NextResponse.json({ error: 'Query failed' }, { status: 500 });

    let sent = 0, skipped = 0, failed = 0;
    for (const f of pending) {
      const tz = f.tenants?.timezone || 'UTC';
      const contact = f.contacts;
      if (contact?.temperature === 'hot' || contact?.temperature === 'booked') {
        await supabaseAdmin.from('scheduled_followups').update({ status: 'cancelled', cancelled_reason: 'already_converted' }).eq('id', f.id);
        skipped++; continue;
      }
      if (!isWithinSendWindow(tz)) { skipped++; continue; }

      const ok = await sendWhatsApp(f.tenant_id, contact?.whatsapp_number, f.message_content);
      if (ok) {
        await supabaseAdmin.from('scheduled_followups').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', f.id);
        if (f.conversation_id) {
          await supabaseAdmin.from('messages').insert({ conversation_id: f.conversation_id, tenant_id: f.tenant_id, direction: 'outbound', sender_type: 'system', content: f.message_content, language: 'en' });
        }
        sent++;
      } else { failed++; }
    }

    console.log(`[FollowUp] Processed: ${sent} sent, ${skipped} skipped, ${failed} failed`);
    return NextResponse.json({ sent, skipped, failed, total: pending.length });
  } catch (err) {
    console.error('[FollowUp] Process error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
