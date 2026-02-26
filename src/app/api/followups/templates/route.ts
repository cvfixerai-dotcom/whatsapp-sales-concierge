// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabaseAdmin
      .from('follow_up_sequences')
      .select('*')
      .eq('tenant_id', sessionUser.tenantId)
      .order('target_temperature', { ascending: true });

    if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    return NextResponse.json({ sequences: data });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, day_3_message, day_7_message, day_21_message, is_active } = body;
    if (!id) return NextResponse.json({ error: 'Missing sequence ID' }, { status: 400 });

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (day_3_message !== undefined) updates.day_3_message = day_3_message;
    if (day_7_message !== undefined) updates.day_7_message = day_7_message;
    if (day_21_message !== undefined) updates.day_21_message = day_21_message;
    if (is_active !== undefined) updates.is_active = is_active;

    const { error } = await supabaseAdmin
      .from('follow_up_sequences')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', sessionUser.tenantId);

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
