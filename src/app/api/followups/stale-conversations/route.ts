// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * Stale Conversation Checker CRON Job
 * 
 * Detects conversations where:
 * - The last message was from the AI (outbound) — customer hasn't replied
 * - The last message is 3+ hours old
 * - No stale nudge has been sent yet for this conversation
 * - The conversation is still active (not closed/handed off)
 * - The contact is not already hot/booked
 * 
 * Sends ONE contextual follow-up nudge per stale conversation.
 * If still no response after 24h, marks the lead as 'cold' (triggers Day 3/7/21 automation).
 * 
 * Run this every 30 minutes via CRON.
 */

const STALE_THRESHOLD_HOURS = 3;
const COLD_THRESHOLD_HOURS = 24;

function isWithinSendWindow(tz: string): boolean {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()),
      10
    );
    return h >= 9 && h < 21; // Wider window than scheduled follow-ups (9AM-9PM)
  } catch {
    return true;
  }
}

async function sendWhatsApp(tenantId: string, to: string, body: string): Promise<boolean> {
  try {
    const { data: t } = await supabaseAdmin
      .from('tenants')
      .select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_number')
      .eq('id', tenantId)
      .single();

    if (!t?.twilio_account_sid || !t?.twilio_auth_token || !t?.twilio_whatsapp_number) return false;

    const fromNumber = t.twilio_whatsapp_number.startsWith('whatsapp:')
      ? t.twilio_whatsapp_number
      : `whatsapp:${t.twilio_whatsapp_number}`;
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${t.twilio_account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${t.twilio_account_sid}:${t.twilio_auth_token}`).toString('base64')}`,
        },
        body: new URLSearchParams({ To: toNumber, From: fromNumber, Body: body }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('[StaleConvo] Twilio error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[StaleConvo] Send failed:', err);
    return false;
  }
}

function buildNudgeMessage(contact: any, lastAiMessage: string): string {
  const name = contact?.name || 'there';
  const interest = contact?.service_interest || '';

  // Build a contextual nudge based on what was last discussed
  if (interest) {
    return `Hey ${name}! Just wanted to make sure you got my last message about ${interest}. Still interested in seeing some options? 😊`;
  }
  return `Hey ${name}! Just checking in — did you get my last message? I'm here if you have any questions!`;
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
    // Auth check
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
    const coldThreshold = new Date(now.getTime() - COLD_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    // ── PHASE 1: Send nudge to 3h+ stale conversations ──

    // Find active conversations where the last message is outbound (AI sent, customer didn't reply)
    // and is older than 3 hours, and no nudge has been sent yet
    const { data: staleConversations, error: staleError } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, tenant_id, contact_id, updated_at,
        contacts(id, whatsapp_number, name, temperature, service_interest, email),
        tenants(timezone)
      `)
      .eq('is_active', true)
      .eq('status', 'active')
      .is('stale_nudge_sent_at', null)
      .lte('updated_at', staleThreshold)
      .limit(30);

    if (staleError) {
      console.error('[StaleConvo] Query error:', staleError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    let nudged = 0, skipped = 0, failed = 0;

    for (const conv of (staleConversations || [])) {
      const contact = conv.contacts;
      const tz = conv.tenants?.timezone || 'UTC';

      // Skip if contact is already hot, booked, or lost
      if (['hot', 'booked', 'lost'].includes(contact?.temperature)) {
        skipped++;
        continue;
      }

      // Skip if outside send window
      if (!isWithinSendWindow(tz)) {
        skipped++;
        continue;
      }

      // Verify the last message in this conversation was outbound (AI sent it, not the customer)
      const { data: lastMsg } = await supabaseAdmin
        .from('messages')
        .select('direction, content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastMsg || lastMsg.direction !== 'outbound') {
        skipped++;
        continue;
      }

      // Build and send nudge
      const nudgeMessage = buildNudgeMessage(contact, lastMsg.content);
      const ok = await sendWhatsApp(conv.tenant_id, contact?.whatsapp_number, nudgeMessage);

      if (ok) {
        // Record the nudge in messages table
        await supabaseAdmin.from('messages').insert({
          conversation_id: conv.id,
          tenant_id: conv.tenant_id,
          direction: 'outbound',
          sender_type: 'system',
          content: nudgeMessage,
          language: 'en',
        });

        // Mark conversation as nudged (prevents re-nudging)
        await supabaseAdmin
          .from('conversations')
          .update({ stale_nudge_sent_at: now.toISOString() })
          .eq('id', conv.id);

        nudged++;
      } else {
        failed++;
      }
    }

    // ── PHASE 2: Mark 24h+ stale conversations as cold ──

    // Find conversations where a nudge was sent but still no reply after 24h total
    const { data: coldConversations, error: coldError } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, tenant_id, contact_id, stale_nudge_sent_at,
        contacts(id, temperature)
      `)
      .eq('is_active', true)
      .eq('status', 'active')
      .not('stale_nudge_sent_at', 'is', null)
      .lte('updated_at', coldThreshold)
      .limit(30);

    let markedCold = 0;

    for (const conv of (coldConversations || [])) {
      const contact = conv.contacts;

      // Only downgrade warm/new leads to cold (don't touch hot/booked)
      if (!contact || ['hot', 'booked', 'cold', 'lost'].includes(contact?.temperature)) {
        continue;
      }

      // Verify last message is still outbound (customer hasn't replied since nudge)
      const { data: lastMsg } = await supabaseAdmin
        .from('messages')
        .select('direction, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastMsg || lastMsg.direction !== 'outbound') {
        continue; // Customer replied, skip
      }

      // Mark as cold — this triggers Day 3/7/21 automated follow-ups via the scheduler
      await supabaseAdmin
        .from('contacts')
        .update({ temperature: 'cold', updated_at: now.toISOString() })
        .eq('id', contact.id);

      // Schedule follow-ups for the now-cold lead
      const { scheduleFollowUps } = await import('@/lib/services/followup-scheduler');
      await scheduleFollowUps(conv.tenant_id, contact.id, conv.id, 'cold');

      markedCold++;
    }

    console.log(`[StaleConvo] Nudged: ${nudged}, Skipped: ${skipped}, Failed: ${failed}, Marked cold: ${markedCold}`);
    return NextResponse.json({ nudged, skipped, failed, markedCold });
  } catch (err) {
    console.error('[StaleConvo] Process error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
