// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { getAvailableSlots, getAvailabilitySettings } from '../../services/calendar/inapp';

interface CheckCalendarParams {
  tenantId: string;
  contactId?: string;
  preferredDate?: string;
  preferredTime?: string;
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
      datetime: slot.datetime,
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

export async function checkCalendar({ tenantId, contactId, preferredDate, preferredTime }: CheckCalendarParams): Promise<{
  success: boolean;
  available_slots?: CalendarSlot[];
  error?: string;
}> {
  try {
    console.log(`[Tool: checkCalendar] Checking availability for tenant ${tenantId}, preferredDate=${preferredDate || 'none'}`);

    const settings = await getAvailabilitySettings(tenantId);
    const timezone = settings?.timezone || 'Asia/Dubai';
    const parsedPreferred = preferredDate ? new Date(preferredDate) : null;
    const startDate = parsedPreferred && !Number.isNaN(parsedPreferred.getTime())
      ? parsedPreferred
      : new Date();
    const searchDays = settings?.booking_window_days || 7;
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

    console.log(`[Tool: checkCalendar] In-app calendar returned ${slots.length} slots`);

    return {
      success: true,
      available_slots: slotsToReturn.map(s => ({ 
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
