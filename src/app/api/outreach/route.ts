// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const pageSize = 25;
    const showContacted = searchParams.get('showContacted') === 'true';

    let query = supabaseAdmin
      .from('agency_leads')
      .select('*', { count: 'exact' });

    if (!showContacted) {
      query = query.eq('contacted', false);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('[Outreach] Fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: data || [], total: count || 0, page, pageSize });
  } catch (err) {
    console.error('[Outreach] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id, field, value } = body;

    if (!id || !field) {
      return NextResponse.json({ error: 'Missing id or field' }, { status: 400 });
    }

    const allowedFields = ['linkedin_found', 'contacted', 'replied', 'demo_done', 'trial_started', 'client'];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('agency_leads')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Outreach] Update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Outreach] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
