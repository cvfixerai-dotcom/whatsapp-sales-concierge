// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { tenantId } = sessionUser;
    const url = new URL(request.url);
    const contactId = url.searchParams.get('contact_id');

    let query = supabaseAdmin
      .from('conversations')
      .select('id, contact_id, status, created_at, updated_at, message_count, contacts(name, whatsapp_number, temperature)')
      .eq('tenant_id', tenantId)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false });

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error('[Conversations API] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    // Get last message for each conversation
    const items = await Promise.all(
      (conversations || []).map(async (conv) => {
        const { data: msgData } = await supabaseAdmin
          .from('messages')
          .select('content, sender_type, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastMsg = msgData?.[0];
        const contact = conv.contacts;
        return {
          id: conv.id,
          status: conv.status || 'active',
          handoff_requested: conv.status === 'handoff-requested' || conv.status === 'human-handling',
          updated_at: conv.updated_at,
          contact_name: contact?.name || 'Unknown',
          contact_phone: contact?.whatsapp_number || '',
          contact_temperature: contact?.temperature || 'new',
          last_message: lastMsg?.content || 'No messages yet',
          last_message_time: lastMsg?.created_at || conv.updated_at,
          last_sender: lastMsg?.sender_type || '',
          message_count: conv.message_count || 0,
        };
      })
    );

    const response = NextResponse.json({ conversations: items });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('[Conversations API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
