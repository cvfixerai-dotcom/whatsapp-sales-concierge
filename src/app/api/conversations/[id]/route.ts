// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: conversationId } = await params;
    const tenantId = session.user.tenantId;
    const body = await request.json();

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(body)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ conversation: data });
  } catch (error) {
    console.error('[Conversation PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const tenantId = session.user.tenantId;

    // Get conversation with contact info
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*, contacts(name, whatsapp_number, temperature, email, lead_score)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get ALL conversation IDs for this contact so we merge split-conversation history
    const contactId = conversation.contact_id;
    const { data: siblingConvs } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId);

    const allConvIds = (siblingConvs || []).map((c: any) => c.id);
    if (!allConvIds.includes(conversationId)) allConvIds.push(conversationId);

    // Fetch messages across all conversations for this contact
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('id, content, sender_type, direction, created_at, ai_confidence, ai_intent, ai_sentiment, handoff_trigger, conversation_id')
      .in('conversation_id', allConvIds)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('[Conversation API] Messages error:', msgError);
    }

    // Dedup by id in case of any overlap
    const seen = new Set<string>();
    const deduped = (messages || []).filter((m: any) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return NextResponse.json({
      conversation,
      messages: deduped,
    });
  } catch (error) {
    console.error('[Conversation API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}
