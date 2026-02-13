// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * GET /api/calendar/availability — fetch tenant availability settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings } = await supabaseAdmin
      .from('availability_settings')
      .select('*')
      .eq('tenant_id', session.user.tenantId)
      .single();

    // Return settings or defaults
    return NextResponse.json({
      settings: settings || {
        monday_start: '09:00', monday_end: '17:00', monday_enabled: true,
        tuesday_start: '09:00', tuesday_end: '17:00', tuesday_enabled: true,
        wednesday_start: '09:00', wednesday_end: '17:00', wednesday_enabled: true,
        thursday_start: '09:00', thursday_end: '17:00', thursday_enabled: true,
        friday_start: '09:00', friday_end: '17:00', friday_enabled: true,
        saturday_start: '09:00', saturday_end: '13:00', saturday_enabled: false,
        sunday_start: '09:00', sunday_end: '13:00', sunday_enabled: false,
        slot_duration: 30, buffer_time: 0, max_per_day: 20,
        booking_window_days: 30, min_notice_hours: 2, timezone: 'Asia/Dubai',
      },
    });
  } catch (error) {
    console.error('[Availability] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

/**
 * POST /api/calendar/availability — upsert tenant availability settings
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const tenantId = session.user.tenantId;

    // Check if settings exist
    const { data: existing } = await supabaseAdmin
      .from('availability_settings')
      .select('id')
      .eq('tenant_id', tenantId)
      .single();

    const payload = {
      tenant_id: tenantId,
      monday_start: body.monday_start,
      monday_end: body.monday_end,
      monday_enabled: body.monday_enabled,
      tuesday_start: body.tuesday_start,
      tuesday_end: body.tuesday_end,
      tuesday_enabled: body.tuesday_enabled,
      wednesday_start: body.wednesday_start,
      wednesday_end: body.wednesday_end,
      wednesday_enabled: body.wednesday_enabled,
      thursday_start: body.thursday_start,
      thursday_end: body.thursday_end,
      thursday_enabled: body.thursday_enabled,
      friday_start: body.friday_start,
      friday_end: body.friday_end,
      friday_enabled: body.friday_enabled,
      saturday_start: body.saturday_start,
      saturday_end: body.saturday_end,
      saturday_enabled: body.saturday_enabled,
      sunday_start: body.sunday_start,
      sunday_end: body.sunday_end,
      sunday_enabled: body.sunday_enabled,
      slot_duration: body.slot_duration ?? 30,
      buffer_time: body.buffer_time ?? 0,
      max_per_day: body.max_per_day ?? 20,
      booking_window_days: body.booking_window_days ?? 30,
      min_notice_hours: body.min_notice_hours ?? 2,
      timezone: body.timezone ?? 'Asia/Dubai',
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing?.id) {
      ({ error } = await supabaseAdmin
        .from('availability_settings')
        .update(payload)
        .eq('id', existing.id));
    } else {
      ({ error } = await supabaseAdmin
        .from('availability_settings')
        .insert(payload));
    }

    if (error) {
      console.error('[Availability] Save error:', error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Availability] POST error:', error);
    return NextResponse.json({ error: 'Failed to save availability' }, { status: 500 });
  }
}
