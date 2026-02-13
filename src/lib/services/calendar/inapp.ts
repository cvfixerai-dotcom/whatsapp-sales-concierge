// @ts-nocheck
/**
 * In-App Calendar Service
 * Generates available slots from availability_settings,
 * filters out booked appointments and blocked time ranges.
 */
import { supabaseAdmin } from '../../db/client';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface SlotResult {
  datetime: string;
  formatted: string;
  date: string;
  time: string;
}

export interface AvailabilitySettings {
  id: string;
  tenant_id: string;
  monday_start: string; monday_end: string; monday_enabled: boolean;
  tuesday_start: string; tuesday_end: string; tuesday_enabled: boolean;
  wednesday_start: string; wednesday_end: string; wednesday_enabled: boolean;
  thursday_start: string; thursday_end: string; thursday_enabled: boolean;
  friday_start: string; friday_end: string; friday_enabled: boolean;
  saturday_start: string; saturday_end: string; saturday_enabled: boolean;
  sunday_start: string; sunday_end: string; sunday_enabled: boolean;
  slot_duration: number;
  buffer_time: number;
  max_per_day: number;
  booking_window_days: number;
  min_notice_hours: number;
  timezone: string;
}

function getDefaultSettings(tenantId: string): AvailabilitySettings {
  return {
    id: '', tenant_id: tenantId,
    monday_start: '09:00', monday_end: '17:00', monday_enabled: true,
    tuesday_start: '09:00', tuesday_end: '17:00', tuesday_enabled: true,
    wednesday_start: '09:00', wednesday_end: '17:00', wednesday_enabled: true,
    thursday_start: '09:00', thursday_end: '17:00', thursday_enabled: true,
    friday_start: '09:00', friday_end: '17:00', friday_enabled: true,
    saturday_start: '09:00', saturday_end: '13:00', saturday_enabled: false,
    sunday_start: '09:00', sunday_end: '13:00', sunday_enabled: false,
    slot_duration: 30, buffer_time: 0, max_per_day: 20,
    booking_window_days: 30, min_notice_hours: 2, timezone: 'Asia/Dubai',
  };
}

/**
 * Get or create availability settings for a tenant
 */
export async function getAvailabilitySettings(tenantId: string): Promise<AvailabilitySettings> {
  const { data } = await supabaseAdmin
    .from('availability_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  return data || getDefaultSettings(tenantId);
}

/**
 * Get available appointment slots for a tenant
 */
export async function getAvailableSlots(
  tenantId: string,
  startDate?: Date,
  days: number = 7
): Promise<SlotResult[]> {
  const settings = await getAvailabilitySettings(tenantId);
  const timezone = settings.timezone || 'Asia/Dubai';
  const slotDuration = settings.slot_duration || 30;
  const bufferTime = settings.buffer_time || 0;
  const minNoticeHours = settings.min_notice_hours || 2;
  const bookingWindowDays = settings.booking_window_days || 30;
  const maxPerDay = settings.max_per_day || 20;

  const start = startDate || new Date();
  const cappedDays = Math.min(days, bookingWindowDays);

  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + cappedDays);

  // Fetch booked appointments
  const { data: booked } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_time, duration')
    .eq('tenant_id', tenantId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('scheduled_time', start.toISOString())
    .lte('scheduled_time', endDate.toISOString());

  // Fetch blocked slots
  const { data: blocked } = await supabaseAdmin
    .from('blocked_slots')
    .select('start_time, end_time')
    .eq('tenant_id', tenantId)
    .lte('start_time', endDate.toISOString())
    .gte('end_time', start.toISOString());

  const bookedTimes = new Set(
    (booked || []).map(a => new Date(a.scheduled_time).getTime())
  );

  const blockedRanges = (blocked || []).map(b => ({
    start: new Date(b.start_time).getTime(),
    end: new Date(b.end_time).getTime(),
  }));

  const now = new Date();
  const minNoticeTime = now.getTime() + minNoticeHours * 60 * 60 * 1000;
  const maxBookingTime = now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000;

  const slots: SlotResult[] = [];

  for (let dayOffset = 0; dayOffset < cappedDays; dayOffset++) {
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);

    if (date.getTime() > maxBookingTime) break;

    const dayName = DAY_NAMES[date.getDay()];
    const dayEnabled = settings[`${dayName}_enabled`];
    if (!dayEnabled) continue;

    const dayStartStr = settings[`${dayName}_start`] || '09:00';
    const dayEndStr = settings[`${dayName}_end`] || '17:00';
    const [startH, startM] = dayStartStr.split(':').map(Number);
    const [endH, endM] = dayEndStr.split(':').map(Number);

    // Count booked for this day
    const dayStartMs = new Date(date).setHours(0, 0, 0, 0);
    const dayEndMs = new Date(date).setHours(23, 59, 59, 999);
    const dayBookedCount = (booked || []).filter(a => {
      const t = new Date(a.scheduled_time).getTime();
      return t >= dayStartMs && t <= dayEndMs;
    }).length;

    if (dayBookedCount >= maxPerDay) continue;

    // Generate time slots for this day
    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const step = slotDuration + bufferTime;

    while (currentMinutes + slotDuration <= endMinutes) {
      const slotDate = new Date(date);
      slotDate.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);
      const slotTime = slotDate.getTime();

      // Skip if before minimum notice
      if (slotTime < minNoticeTime) {
        currentMinutes += step;
        continue;
      }

      // Skip if already booked
      if (bookedTimes.has(slotTime)) {
        currentMinutes += step;
        continue;
      }

      // Skip if in a blocked range
      const slotEnd = slotTime + slotDuration * 60 * 1000;
      const isBlocked = blockedRanges.some(
        r => slotTime < r.end && slotEnd > r.start
      );
      if (isBlocked) {
        currentMinutes += step;
        continue;
      }

      slots.push({
        datetime: slotDate.toISOString(),
        formatted: slotDate.toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: timezone,
        }),
        date: slotDate.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          timeZone: timezone,
        }),
        time: slotDate.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: timezone,
        }),
      });

      currentMinutes += step;
    }
  }

  return slots;
}

/**
 * Check if a specific slot is available
 */
export async function isSlotAvailable(
  tenantId: string,
  scheduledAt: string,
  duration: number = 30
): Promise<boolean> {
  const slotStart = new Date(scheduledAt);
  const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

  // Check for overlapping appointments
  const { data: conflicts } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('status', ['scheduled', 'confirmed'])
    .lt('scheduled_time', slotEnd.toISOString())
    .gt('scheduled_time', new Date(slotStart.getTime() - duration * 60 * 1000).toISOString())
    .limit(1);

  if (conflicts && conflicts.length > 0) return false;

  // Check blocked slots
  const { data: blockedConflicts } = await supabaseAdmin
    .from('blocked_slots')
    .select('id')
    .eq('tenant_id', tenantId)
    .lt('start_time', slotEnd.toISOString())
    .gt('end_time', slotStart.toISOString())
    .limit(1);

  if (blockedConflicts && blockedConflicts.length > 0) return false;

  return true;
}

/**
 * Book an appointment slot (in-app)
 */
export async function bookSlot(params: {
  tenantId: string;
  contactId?: string;
  scheduledAt: string;
  duration?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  appointmentType?: string;
  notes?: string;
  bookedVia?: string;
  conversationId?: string;
}): Promise<{ success: boolean; appointment?: any; error?: string }> {
  const duration = params.duration || 30;

  // Verify slot is still available
  const available = await isSlotAvailable(params.tenantId, params.scheduledAt, duration);
  if (!available) {
    return { success: false, error: 'Slot is no longer available' };
  }

  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      tenant_id: params.tenantId,
      contact_id: params.contactId || null,
      scheduled_time: params.scheduledAt,
      duration: duration,
      status: 'scheduled',
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_email: params.customerEmail || null,
      appointment_type: params.appointmentType || 'general',
      notes: params.notes || null,
      booked_via: params.bookedVia || 'whatsapp',
      conversation_id: params.conversationId || null,
      calendar_provider: 'inapp',
      calendar_event_id: `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
    .select()
    .single();

  if (error) {
    console.error('[InApp Calendar] Book error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, appointment };
}
