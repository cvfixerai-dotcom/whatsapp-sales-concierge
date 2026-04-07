import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

/**
 * GET /api/calendar/appointments?start=2024-02-01T00:00:00.000Z&end=2024-02-29T23:59:59.000Z
 */
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 });
    }

    // Expand range by 1 day to avoid timezone edge misses
    const rangeStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rangeEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(`*, contacts(name, whatsapp_number, email)`)
      .eq('tenant_id', sessionUser.tenantId)
      .gte('scheduled_time', rangeStart)
      .lte('scheduled_time', rangeEnd)
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('[Calendar Appointments] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }

    return NextResponse.json({ appointments: data || [] });
  } catch (error) {
    console.error('[Calendar Appointments] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
