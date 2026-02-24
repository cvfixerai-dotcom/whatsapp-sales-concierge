// @ts-nocheck
import { getAvailableSlots } from '../../services/calendar/inapp';

interface CheckCalendarParams {
  tenantId: string;
  preferredDate?: string;
}

interface CalendarSlot {
  datetime: string;
  formatted: string;
  dayName: string;
  dateOnly: string;
}

export async function checkCalendar({ tenantId, preferredDate }: CheckCalendarParams): Promise<{
  success: boolean;
  available_slots?: CalendarSlot[];
  error?: string;
}> {
  try {
    console.log(`[Tool: checkCalendar] Checking availability for tenant ${tenantId}, preferredDate=${preferredDate || 'none'}`);

    const startDate = preferredDate ? new Date(preferredDate) : new Date();
    const slots = await getAvailableSlots(tenantId, startDate, 7);

    console.log(`[Tool: checkCalendar] In-app calendar returned ${slots.length} slots`);

    return {
      success: true,
      available_slots: slots.map(s => ({ 
        datetime: s.datetime, 
        formatted: s.formatted,
        dayName: s.dayName,
        dateOnly: s.dateOnly,
      })),
    };
  } catch (error) {
    console.error('[Tool: checkCalendar] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
