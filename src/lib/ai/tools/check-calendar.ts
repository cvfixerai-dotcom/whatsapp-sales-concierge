import { supabaseAdmin } from '../../db/client';
import { getAvailableSlots, getAvailabilitySettings } from '../../services/calendar/inapp';
import { GoogleCalendarProvider } from '../../services/calendar/google';

interface CheckCalendarParams {
  tenantId: string;
  contactId?: string;
  preferredDate?: string;
  preferredTime?: string;
  daysAhead?: number;
}

interface CalendarSlot {
  datetime: string;
  formatted: string;
  dayName: string;
  dateOnly: string;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function extractDayName(input: string): string | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  return DAY_NAMES.find(day => lowered.includes(day)) || null;
}

function extractMonthDay(input: string): { monthIndex: number; day: number } | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  const monthKey = MONTH_KEYS.find(key => lowered.includes(key));
  const dayMatch = lowered.match(/\b([0-3]?\d)(st|nd|rd|th)?\b/);
  if (!monthKey || !dayMatch) return null;
  return { monthIndex: MONTH_KEYS.indexOf(monthKey), day: parseInt(dayMatch[1], 10) };
}

function monthDayMatches(dateOnly: string, target: { monthIndex: number; day: number }): boolean {
  const normalized = dateOnly.toLowerCase();
  const monthKey = MONTH_KEYS[target.monthIndex];
  return normalized.includes(monthKey) && new RegExp(`\\b${target.day}\\b`).test(normalized);
}

function extractTimeParts(input: string): { hours: number; minutes: number } | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  if (lowered.includes('noon')) return { hours: 12, minutes: 0 };
  if (lowered.includes('midnight')) return { hours: 0, minutes: 0 };
  const match = lowered.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  if (match[3] === 'pm' && hours < 12) hours += 12;
  if (match[3] === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
}

function timeMatches(slotTime: string, target: { hours: number; minutes: number }): boolean {
  const match = slotTime?.toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
  if (!match) return false;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (match[3] === 'pm' && hours < 12) hours += 12;
  if (match[3] === 'am' && hours === 12) hours = 0;
  return hours === target.hours && minutes === target.minutes;
}

function getDateOnlyInTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

async function storeLastSlots(contactId: string | undefined, slots: any[], timezone: string): Promise<void> {
  if (!contactId) return;
  try {
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('metadata')
      .eq('id', contactId)
      .single();

    const existingMetadata =
      contact?.metadata && typeof contact.metadata === 'object' && !Array.isArray(contact.metadata)
        ? contact.metadata
        : {};

    const slotPayload = (slots || []).slice(0, 20).map(slot => ({
      datetime: slot.datetime,    // ISO — required for resolveFromLastOfferedSlots matching
      formatted: slot.formatted,
      time: slot.time,
      dayName: slot.dayName,
      dateOnly: slot.dateOnly,
    }));

    await supabaseAdmin
      .from('contacts')
      .update({
        metadata: {
          ...existingMetadata,
          calendar_last_slots: slotPayload,
          calendar_last_slots_at: new Date().toISOString(),
          calendar_last_timezone: timezone,
        },
      })
      .eq('id', contactId);
  } catch (error) {
    console.error('[Tool: checkCalendar] Failed to store last slots:', error);
  }
}

/**
 * Check calendar for available appointment slots
 * 
 * TIMEZONE PHILOSOPHY:
 * - Returns slots in BUSINESS TIMEZONE ONLY
 * - When user says "2pm", we interpret as 2pm business time
 * - NO user timezone detection or conversion
 * - Slots are formatted for display in business timezone
 * - ISO datetimes represent business time (stored as UTC)
 */
export async function checkCalendar({ tenantId, contactId, preferredDate, preferredTime, daysAhead }: CheckCalendarParams): Promise<{
  success: boolean;
  available_slots?: CalendarSlot[];
  error?: string;
}> {
  try {
    // Log tool call with clean parameter summary
    console.log('\n=== 📅 CHECK CALENDAR TOOL ===');
    console.log('[Tool: check_calendar] ✅ CALLED with parameters:', {
      tenantId: tenantId.substring(0, 8) + '...',
      contactId: contactId ? contactId.substring(0, 8) + '...' : 'none',
      preferredDate: preferredDate || 'none',
      preferredTime: preferredTime || 'none',
      daysAhead: daysAhead || 'default (7)'
    });

    // Check if Google Calendar is configured
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('calendar_provider, google_refresh_token, google_calendar_id')
      .eq('id', tenantId)
      .single();

    // Route to Google Calendar if configured
    if (tenant?.calendar_provider === 'google' && tenant?.google_refresh_token) {
      console.log('[Tool: checkCalendar] Using Google Calendar provider');
      const googleProvider = new GoogleCalendarProvider();
      const settings = await getAvailabilitySettings(tenantId);
      const timezone = settings?.timezone || 'Asia/Dubai';
      
      // Convert availability_settings to business_hours format expected by Google provider
      const businessHours = {
        monday: settings.monday_enabled ? { open: settings.monday_start?.substring(0, 5) || '09:00', close: settings.monday_end?.substring(0, 5) || '17:00' } : null,
        tuesday: settings.tuesday_enabled ? { open: settings.tuesday_start?.substring(0, 5) || '09:00', close: settings.tuesday_end?.substring(0, 5) || '17:00' } : null,
        wednesday: settings.wednesday_enabled ? { open: settings.wednesday_start?.substring(0, 5) || '09:00', close: settings.wednesday_end?.substring(0, 5) || '17:00' } : null,
        thursday: settings.thursday_enabled ? { open: settings.thursday_start?.substring(0, 5) || '09:00', close: settings.thursday_end?.substring(0, 5) || '17:00' } : null,
        friday: settings.friday_enabled ? { open: settings.friday_start?.substring(0, 5) || '09:00', close: settings.friday_end?.substring(0, 5) || '17:00' } : null,
        saturday: settings.saturday_enabled ? { open: settings.saturday_start?.substring(0, 5) || '09:00', close: settings.saturday_end?.substring(0, 5) || '17:00' } : null,
        sunday: settings.sunday_enabled ? { open: settings.sunday_start?.substring(0, 5) || '09:00', close: settings.sunday_end?.substring(0, 5) || '17:00' } : null,
      };
      
      console.log('[Tool: checkCalendar] Converted business hours for Google:', businessHours);
      
      const result = await googleProvider.checkAvailability(
        {
          googleCalendarId: tenant.google_calendar_id,
          googleRefreshToken: tenant.google_refresh_token,
          timezone,
          businessHours,
        },
        preferredDate
      );

      if (!result.success) {
        console.warn('[Tool: checkCalendar] Google Calendar failed, falling back to in-app');
        // Fall through to in-app calendar
      } else {
        const slots = result.availableSlots || [];
        await storeLastSlots(contactId, slots, timezone);
        console.log(`[Tool: checkCalendar] Returning ${slots.length} Google Calendar slots`);
        console.log('=== END CHECK CALENDAR ===\n');
        return {
          success: true,
          available_slots: slots.map(s => ({
            datetime: s.datetime,
            formatted: s.formatted,
            dayName: s.dayName || new Date(s.datetime).toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }),
            dateOnly: s.dateOnly || new Date(s.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone }),
          })),
        };
      }
    }

    // Use in-app calendar (default or fallback)
    console.log('[Tool: checkCalendar] Using in-app calendar provider');
    const settings = await getAvailabilitySettings(tenantId);
    const timezone = settings?.timezone || 'Asia/Dubai'; // Business timezone (no user timezone)
    
    console.log(`[Tool: checkCalendar] Timezone: ${timezone}`);
    console.log(`[Tool: checkCalendar] Business hours:`, {
      monday: settings.monday_enabled ? `${settings.monday_start}-${settings.monday_end}` : 'CLOSED',
      tuesday: settings.tuesday_enabled ? `${settings.tuesday_start}-${settings.tuesday_end}` : 'CLOSED',
      wednesday: settings.wednesday_enabled ? `${settings.wednesday_start}-${settings.wednesday_end}` : 'CLOSED',
      thursday: settings.thursday_enabled ? `${settings.thursday_start}-${settings.thursday_end}` : 'CLOSED',
      friday: settings.friday_enabled ? `${settings.friday_start}-${settings.friday_end}` : 'CLOSED',
      saturday: settings.saturday_enabled ? `${settings.saturday_start}-${settings.saturday_end}` : 'CLOSED',
      sunday: settings.sunday_enabled ? `${settings.sunday_start}-${settings.sunday_end}` : 'CLOSED',
    });
    const parsedPreferred = preferredDate ? new Date(preferredDate) : null;
    const startDate = parsedPreferred && !Number.isNaN(parsedPreferred.getTime())
      ? parsedPreferred
      : new Date();
    const searchDays = daysAhead || settings?.booking_window_days || 7;
    const slots = await getAvailableSlots(tenantId, startDate, searchDays);
    const preferredInput = [preferredDate, preferredTime].filter(Boolean).join(' ').toLowerCase();
    const preferredTimeInput = (preferredTime || '').toLowerCase();
    let filteredSlots = slots;

    const timeParts = extractTimeParts(preferredTimeInput || preferredInput);
    if (timeParts) {
      filteredSlots = filteredSlots.filter(slot =>
        timeMatches(slot.time || slot.formatted || '', timeParts)
      );
    }

    const dayName = extractDayName(preferredInput);
    if (dayName) {
      filteredSlots = filteredSlots.filter(slot =>
        slot.dayName.toLowerCase().startsWith(dayName)
      );
    }

    const monthDay = extractMonthDay(preferredInput);
    if (monthDay) {
      filteredSlots = filteredSlots.filter(slot =>
        monthDayMatches(slot.dateOnly, monthDay)
      );
    }

    if (preferredInput.includes('today') || preferredInput.includes('tomorrow')) {
      const baseInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
      if (preferredInput.includes('tomorrow')) {
        baseInTz.setDate(baseInTz.getDate() + 1);
      }
      const targetDateOnly = getDateOnlyInTimezone(baseInTz, timezone);
      filteredSlots = filteredSlots.filter(slot => slot.dateOnly === targetDateOnly);
    }

    const slotsToReturn = filteredSlots.length ? filteredSlots : slots;
    await storeLastSlots(contactId, slotsToReturn, timezone);

    console.log(`[Tool: checkCalendar] Total slots generated: ${slots.length}`);
    console.log(`[Tool: checkCalendar] Filtered slots: ${filteredSlots.length}`);
    console.log(`[Tool: checkCalendar] Returning ${slotsToReturn.length} slots to AI`);
    
    if (slotsToReturn.length > 0) {
      console.log('[Tool: checkCalendar] First 3 slots:', slotsToReturn.slice(0, 3).map(s => ({
        datetime: s.datetime,
        formatted: s.formatted,
        dayName: s.dayName,
      })));
    } else {
      console.warn('[Tool: checkCalendar] ⚠️ NO SLOTS AVAILABLE - AI should ask to check with team');
    }
    
    console.log('=== END CHECK CALENDAR ===\n');

    // IMPORTANT: The AI must display `formatted` to the user but pass `datetime` (ISO) to book_appointment.
    // Never ask the AI to construct or guess a datetime — only the ISO values from this list are valid for booking.
    return {
      success: true,
      available_slots: slotsToReturn.map(s => ({
        datetime: s.datetime,    // ISO 8601 — pass this exact value to book_appointment
        formatted: s.formatted,  // Human-readable — display this to the customer
        dayName: s.dayName,
        dateOnly: s.dateOnly,
      })),
    };
  } catch (error) {
    console.error('[Tool: checkCalendar] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
