// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';


import { getAvailableSlots } from '@/lib/services/calendar/inapp';

/**
 * GET /api/calendar/slots?date=2024-02-15&days=7
 */
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const days = parseInt(searchParams.get('days') || '7');

    const startDate = dateParam ? new Date(dateParam) : new Date();
    const slots = await getAvailableSlots(sessionUser.tenantId, startDate, days);

    return NextResponse.json({ slots, count: slots.length });
  } catch (error) {
    console.error('[Calendar Slots] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
}
