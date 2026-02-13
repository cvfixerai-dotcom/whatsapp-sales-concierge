// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';
import { twilioService } from '@/lib/services/twilio';

/**
 * POST /api/conversations/reply
 * Send a WhatsApp message from the dashboard and save it in messages table.
 *
 * Body: { conversation_id, content }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const body = await request.json();
    const { conversation_id, content } = body;

    if (!conversation_id || !content?.trim()) {
      return NextResponse.json({ error: 'conversation_id and content are required' }, { status: 400 });
    }

    // Get conversation + contact
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, status')
      .eq('id', conversation_id)
      .eq('tenant_id', tenantId)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .select('whatsapp_number, name')
      .eq('id', conversation.contact_id)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Send via Twilio
    const sendResult = await twilioService.sendWhatsAppMessage(
      tenantId,
      contact.whatsapp_number,
      content.trim(),
      { bypassRateLimit: true }
    );

    if (!sendResult.success) {
      console.error('[Reply] Twilio send failed:', sendResult.error);
      return NextResponse.json({ error: sendResult.error || 'Failed to send message' }, { status: 502 });
    }

    // Save message in DB
    const { data: message, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id,
        content: content.trim(),
        sender_type: 'human',
        direction: 'outbound',
        twilio_message_sid: sendResult.messageSid || null,
        metadata: {
          agent_id: session.user.id,
          agent_email: session.user.email,
          sent_from: 'dashboard',
        },
      })
      .select()
      .single();

    if (msgErr) {
      console.error('[Reply] Failed to save message:', msgErr);
      // Message was sent but not saved — still return success
    }

    // Update conversation status to human_active + bump updated_at
    await supabaseAdmin
      .from('conversations')
      .update({
        status: 'human_active',
        assigned_agent_id: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    console.log(`[Reply] Agent ${session.user.email} replied to conversation ${conversation_id}`);

    return NextResponse.json({
      success: true,
      message: message || { content: content.trim(), sender_type: 'human' },
    });
  } catch (error) {
    console.error('[Reply] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 });
  }
}
