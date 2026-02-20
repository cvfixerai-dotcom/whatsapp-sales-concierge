// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { contact_id } = await request.json();
    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    const tenantId = session.user.tenantId;

    // Find the most recent active conversation for this contact
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, status')
      .eq('contact_id', contact_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ conversation_id: existing.id });
    }

    // Close any stale inactive conversations that might block webhook lookup
    await supabaseAdmin
      .from('conversations')
      .update({ is_active: false })
      .eq('contact_id', contact_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', false); // no-op but safe

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
