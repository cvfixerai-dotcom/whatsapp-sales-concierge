import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';
const PAGE_SIZE = 20;
export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tenantId } = sessionUser;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '0', 10);
  const sortAsc = url.searchParams.get('sort') === 'asc';
  const filterSource = url.searchParams.get('source') || 'all';
  const filterStatus = url.searchParams.get('status') || 'all';
  let q = supabaseAdmin.from('webhook_events').select('*', { count: 'exact' })
    .eq('tenant_id', tenantId).order('created_at', { ascending: sortAsc })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (filterSource !== 'all') q = q.eq('source', filterSource);
  if (filterStatus === 'processed') q = q.eq('processed', true);
  else if (filterStatus === 'pending') q = q.eq('processed', false).eq('retry_count', 0);
  else if (filterStatus === 'failed') q = q.eq('processed', false).gt('retry_count', 0);
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
  return NextResponse.json({ events: data || [], total: count || 0 });
}
