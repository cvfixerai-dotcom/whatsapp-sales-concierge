import { supabaseAdmin } from '../db/client';

function getNext930AM(tz: string): Date {
  const now = new Date();
  const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);
  const t = new Date(now);
  if (h >= 10) t.setDate(t.getDate() + 1);
  t.setHours(9, 30, 0, 0);
  const utcT = new Date(t.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzT = new Date(t.toLocaleString('en-US', { timeZone: tz }));
  return new Date(t.getTime() + (utcT.getTime() - tzT.getTime()));
}

function schedTime(days: number, tz: string): string {
  const b = getNext930AM(tz);
  b.setDate(b.getDate() + (days - 1));
  return b.toISOString();
}

function fill(tpl: string, c: any): string {
  return tpl
    .replace(/\{\{name\}\}/g, c.name || 'there')
    .replace(/\{\{service_interest\}\}/g, c.service_interest || 'property')
    .replace(/\{\{area\}\}/g, c.metadata?.area || 'your preferred area')
    .replace(/\{\{budget\}\}/g, c.budget_range || '');
}

export async function scheduleFollowUps(tenantId: string, contactId: string, convId: string, temperature: string) {
  try {
    if (temperature === 'hot' || temperature === 'booked') return;
    const target = (temperature === 'warm') ? 'warm' : 'cold';

    const [seqRes, contactRes, tenantRes] = await Promise.all([
      supabaseAdmin.from('follow_up_sequences').select('*').eq('tenant_id', tenantId).eq('target_temperature', target).eq('is_active', true).limit(1),
      supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
      supabaseAdmin.from('tenants').select('timezone').eq('id', tenantId).single(),
    ]);

    const seq = seqRes.data?.[0];
    const contact = contactRes.data;
    const tz = tenantRes.data?.timezone || 'UTC';
    if (!seq || !contact) return;

    // Cancel any existing pending follow-ups for this contact
    await supabaseAdmin.from('scheduled_followups').update({ status: 'cancelled', cancelled_reason: 'new_sequence' }).eq('contact_id', contactId).eq('status', 'pending');

    const followups = [
      { follow_up_type: 'day_3', scheduled_for: schedTime(3, tz), message_content: fill(seq.day_3_message, contact) },
      { follow_up_type: 'day_7', scheduled_for: schedTime(7, tz), message_content: fill(seq.day_7_message, contact) },
      { follow_up_type: 'day_21', scheduled_for: schedTime(21, tz), message_content: fill(seq.day_21_message, contact) },
    ];

    const inserts = followups.map(f => ({
      tenant_id: tenantId, contact_id: contactId, conversation_id: convId,
      sequence_id: seq.id, ...f, status: 'pending',
    }));

    await supabaseAdmin.from('scheduled_followups').insert(inserts);
    console.log(`[FollowUp] Scheduled ${target} sequence for contact ${contactId} in tz ${tz}`);
  } catch (err) {
    console.error('[FollowUp] Schedule error:', err);
  }
}

export async function cancelFollowUps(contactId: string, reason: string) {
  try {
    await supabaseAdmin.from('scheduled_followups').update({ status: 'cancelled', cancelled_reason: reason }).eq('contact_id', contactId).eq('status', 'pending');
    console.log(`[FollowUp] Cancelled pending follow-ups for ${contactId}: ${reason}`);
  } catch (err) {
    console.error('[FollowUp] Cancel error:', err);
  }
}
