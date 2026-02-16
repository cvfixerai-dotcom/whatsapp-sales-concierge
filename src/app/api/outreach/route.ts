// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

const BOOLEAN_FILTERS = ['linkedin_found', 'contacted', 'replied', 'demo_done', 'trial_started', 'client'];
const ALLOWED_FIELDS = [...BOOLEAN_FILTERS, 'contact_name', 'linkedin_url', 'company_corrected', 'notes'];

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

    let query = supabaseAdmin
      .from('agency_leads')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    // Apply boolean filters
    for (const f of BOOLEAN_FILTERS) {
      const val = searchParams.get(f);
      if (val === 'true') query = query.eq(f, true);
      if (val === 'false') query = query.eq(f, false);
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

    if (!ALLOWED_FIELDS.includes(field)) {
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

// Bulk update
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { ids, field, value } = body;

    if (!ids || !Array.isArray(ids) || !field) {
      return NextResponse.json({ error: 'Missing ids array or field' }, { status: 400 });
    }

    if (!ALLOWED_FIELDS.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('agency_leads')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (error) {
      console.error('[Outreach] Bulk update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error('[Outreach] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
