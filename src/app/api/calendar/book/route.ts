// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';


import { bookSlot } from '@/lib/services/calendar/inapp';

/**
 * POST /api/calendar/book
 * Book an appointment slot from the dashboard
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scheduled_at, duration, customer_name, customer_phone, customer_email, appointment_type, notes } = body;

    if (!scheduled_at || !customer_name || !customer_phone) {
      return NextResponse.json(
        { error: 'scheduled_at, customer_name, and customer_phone are required' },
        { status: 400 }
      );
    }

    const result = await bookSlot({
      tenantId: sessionUser.tenantId,
      scheduledAt: scheduled_at,
      duration: duration || 30,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      appointmentType: appointment_type || 'general',
      notes,
      bookedVia: 'dashboard',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ success: true, appointment: result.appointment });
  } catch (error) {
    console.error('[Calendar Book] Error:', error);
    return NextResponse.json({ error: 'Failed to book appointment' }, { status: 500 });
  }
}
