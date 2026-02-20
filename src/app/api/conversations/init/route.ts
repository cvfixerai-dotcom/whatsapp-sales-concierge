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

    // Check if conversation already exists
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('contact_id', contact_id)
      .eq('tenant_id', tenantId)
      .single();

    if (existing) {
      return NextResponse.json({ conversation_id: existing.id });
    }

    // Create new conversation
    const { data: newConv, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        contact_id,
        tenant_id: tenantId,
        status: 'active',
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
