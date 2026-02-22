// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * GET /api/calendar/blocks?start=2024-02-01T00:00:00.000Z&end=2024-02-29T23:59:59.000Z
 * POST /api/calendar/blocks { start_time, end_time, reason? }
 * DELETE /api/calendar/blocks?id=uuid
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('blocked_slots')
      .select('id, start_time, end_time, reason')
      .eq('tenant_id', session.user.tenantId)
      .lte('start_time', end)
      .gte('end_time', start)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[Calendar Blocks] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
    }

    return NextResponse.json({ blocks: data || [] });
  } catch (error) {
    console.error('[Calendar Blocks] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { start_time, end_time, reason } = body || {};

    if (!start_time || !end_time) {
      return NextResponse.json({ error: 'start_time and end_time are required' }, { status: 400 });
    }

    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start_time or end_time' }, { status: 400 });
    }
    if (endDate <= startDate) {
      return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('blocked_slots')
      .insert({
        tenant_id: session.user.tenantId,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        reason: reason || null,
      })
      .select('id, start_time, end_time, reason')
      .single();

    if (error) {
      console.error('[Calendar Blocks] Insert error:', error);
      return NextResponse.json({ error: 'Failed to create block' }, { status: 500 });
    }

    return NextResponse.json({ block: data });
  } catch (error) {
    console.error('[Calendar Blocks] POST error:', error);
    return NextResponse.json({ error: 'Failed to create block' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('blocked_slots')
      .delete()
      .eq('tenant_id', session.user.tenantId)
      .eq('id', id);

    if (error) {
      console.error('[Calendar Blocks] Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete block' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Calendar Blocks] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete block' }, { status: 500 });
  }
}
