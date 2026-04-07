import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

/**
 * DELETE /api/conversations/reset
 * Clears conversation history for a specific contact or all conversations for the tenant.
 * 
 * Query params:
 *   - contact_id: (optional) Clear only this contact's conversations
 *   - conversation_id: (optional) Clear only this specific conversation
 *   If neither is provided, clears ALL conversations for the tenant.
 */
export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId } = sessionUser;
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const conversationId = searchParams.get('conversation_id');

    let deletedMessages = 0;
    let deletedConversations = 0;

    if (conversationId) {
      // Delete messages for a specific conversation
      const { data: msgs, error: msgErr } = await supabaseAdmin
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId)
        .select('id');

      if (msgErr) {
        console.error('[Reset] Failed to delete messages:', msgErr);
        return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
      }
      deletedMessages = msgs?.length || 0;

      // Reset the conversation status
      const { error: convErr } = await supabaseAdmin
        .from('conversations')
        .update({ status: 'new', message_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId);

      if (convErr) {
        console.error('[Reset] Failed to reset conversation:', convErr);
      }
      deletedConversations = 1;

    } else if (contactId) {
      // Get all conversations for this contact
      const { data: convos, error: convoErr } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId);

      if (convoErr || !convos) {
        return NextResponse.json({ error: 'Failed to find conversations' }, { status: 500 });
      }

      const convoIds = convos.map(c => c.id);

      if (convoIds.length > 0) {
        // Delete messages
        const { data: msgs } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('conversation_id', convoIds)
          .select('id');
        deletedMessages = msgs?.length || 0;

        // Reset conversations
        await supabaseAdmin
          .from('conversations')
          .update({ status: 'new', message_count: 0, updated_at: new Date().toISOString() })
          .in('id', convoIds)
          .eq('tenant_id', tenantId);
        deletedConversations = convoIds.length;
      }

    } else {
      // Delete ALL messages for this tenant's conversations
      const { data: convos } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId);

      const convoIds = convos?.map(c => c.id) || [];

      if (convoIds.length > 0) {
        const { data: msgs } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('conversation_id', convoIds)
          .select('id');
        deletedMessages = msgs?.length || 0;

        await supabaseAdmin
          .from('conversations')
          .update({ status: 'new', message_count: 0, updated_at: new Date().toISOString() })
          .in('id', convoIds);
        deletedConversations = convoIds.length;
      }
    }

    console.log(`[Reset] Tenant ${tenantId}: deleted ${deletedMessages} messages, reset ${deletedConversations} conversations`);

    return NextResponse.json({
      success: true,
      deleted_messages: deletedMessages,
      reset_conversations: deletedConversations,
    });
  } catch (error) {
    console.error('[Reset] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to reset conversations' }, { status: 500 });
  }
}
