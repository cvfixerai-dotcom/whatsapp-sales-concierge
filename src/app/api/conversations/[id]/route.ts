// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

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

    // Get messages
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('id, content, sender_type, direction, created_at, ai_confidence, ai_intent, ai_sentiment')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('[Conversation API] Messages error:', msgError);
    }

    return NextResponse.json({
      conversation,
      messages: messages || [],
    });
  } catch (error) {
    console.error('[Conversation API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}
