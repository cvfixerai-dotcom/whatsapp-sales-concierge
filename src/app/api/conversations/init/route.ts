import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { contact_id } = await request.json();
    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    const { tenantId } = sessionUser;

    // Find the most recent non-closed conversation (works even if is_active was never set)
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, status, is_active')
      .eq('contact_id', contact_id)
      .eq('tenant_id', tenantId)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Repair is_active if missing (old records created without it)
      if (!existing.is_active) {
        await supabaseAdmin
          .from('conversations')
          .update({ is_active: true })
          .eq('id', existing.id);
      }
      return NextResponse.json({ conversation_id: existing.id });
    }

    // Create new conversation
    const { data: newConv, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        contact_id,
        tenant_id: tenantId,
        status: 'active',
        is_active: true,
        conversation_window_start: new Date().toISOString(),
        message_count: 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ conversation_id: newConv.id });
  } catch (error) {
    console.error('[Init Conversation] Error:', error);
    return NextResponse.json({ error: 'Failed to initialize conversation' }, { status: 500 });
  }
}
