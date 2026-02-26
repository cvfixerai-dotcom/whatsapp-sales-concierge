// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: conversationId } = await params;
    const { tenantId } = sessionUser;
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
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const { tenantId } = sessionUser;

    // Get conversation with contact info
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*, contacts(*)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Primary: fetch messages for this conversation
    const { data: primaryMsgs, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id, content, sender_type, direction, created_at, ai_confidence, ai_intent, ai_sentiment, handoff_reason, requires_handoff, conversation_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    // Also fetch messages from sibling conversations (same contact) to merge split history
    let allMessages = [...(primaryMsgs || [])];
    if (conversation.contact_id) {
      const { data: siblings } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', conversation.contact_id)
        .neq('id', conversationId);

      for (const sib of (siblings || [])) {
        const { data: sibMsgs } = await supabaseAdmin
          .from('messages')
          .select('id, content, sender_type, direction, created_at, ai_confidence, ai_intent, ai_sentiment, handoff_reason, requires_handoff, conversation_id')
          .eq('conversation_id', sib.id)
          .order('created_at', { ascending: true });
        if (sibMsgs?.length) allMessages = [...allMessages, ...sibMsgs];
      }
    }

    // Dedup by id and sort chronologically
    const seen = new Set();
    const messages = allMessages
      .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const normalizedMessages = messages.map((m: any) => ({
      ...m,
      handoff_trigger: m.handoff_trigger ?? m.handoff_reason ?? (m.requires_handoff ? 'Handoff requested' : null),
    }));

    console.log(`[GET /conv/${conversationId}] primary=${primaryMsgs?.length ?? 0} total=${messages.length} err=${msgErr?.message ?? 'none'}`);

    const response = NextResponse.json({ conversation, messages: normalizedMessages || [] });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('[Conversation API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}
