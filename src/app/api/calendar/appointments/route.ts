// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * GET /api/calendar/appointments?start=2024-02-01T00:00:00.000Z&end=2024-02-29T23:59:59.000Z
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
      .from('appointments')
      .select(`*, contacts(name, whatsapp_number, email)`)
      .eq('tenant_id', session.user.tenantId)
      .gte('scheduled_time', start)
      .lte('scheduled_time', end)
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
