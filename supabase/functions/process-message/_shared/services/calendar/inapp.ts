/**
 * In-App Calendar Service
 * Generates available slots from availability_settings,
 * filters out booked appointments and blocked time ranges.
 */
import { supabaseAdmin } from '../../db/client.ts';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface SlotResult {
  datetime: string;
  formatted: string;
  date: string;
  time: string;
  dayName: string;
  dateOnly: string;
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
 * 
 * TIMEZONE PHILOSOPHY:
 * - All slots are generated in BUSINESS TIMEZONE ONLY (e.g., Asia/Dubai)
 * - Business hours (9am-6pm) are interpreted as business local time
 * - NO user timezone detection or conversion
 * - When AI says "1pm available", it means 1pm business time
 * - Customer from any timezone books "1pm" → gets 1pm business time
 * 
 * Why? Customers booking locally don't do timezone math. They mean business hours.
 */
export async function getAvailableSlots(
  tenantId: string,
  startDate?: Date,
  days: number = 7
): Promise<SlotResult[]> {
  console.log('\n=== 🔍 GET AVAILABLE SLOTS - DETAILED TRACE ===');
  
  const settings = await getAvailabilitySettings(tenantId);
  const timezone = settings.timezone || 'Asia/Dubai'; // Business timezone (no user timezone)
  
  console.log('[CHECK_CALENDAR] Tenant timezone:', timezone);
  console.log('[CHECK_CALENDAR] Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const slotDuration = settings.slot_duration || 30;
  const bufferTime = settings.buffer_time || 0;
  const minNoticeHours = Math.max(0.5, settings.min_notice_hours || 0.5);
  const bookingWindowDays = settings.booking_window_days || 30;
  const maxPerDay = settings.max_per_day || 20;

  console.log('[getAvailableSlots] Settings loaded:');
  console.log('  Timezone:', timezone);
  console.log('  Slot Duration:', slotDuration, 'minutes');
  console.log('  Buffer Time:', bufferTime, 'minutes');
  console.log('  Min Notice Hours:', minNoticeHours, '⚠️ CRITICAL - slots within this time are blocked');
  console.log('  Booking Window:', bookingWindowDays, 'days');
  console.log('  Max Per Day:', maxPerDay, 'appointments');

  const start = startDate || new Date();
  const cappedDays = Math.min(days, bookingWindowDays);

  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + cappedDays);
  
  console.log('[getAvailableSlots] Date range:');
  console.log('  Start:', start.toISOString());
  console.log('  End:', endDate.toISOString());
  console.log('  Days to search:', cappedDays);

  // Fetch booked appointments
  const { data: booked } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_time, duration, duration_minutes')
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

  console.log('[getAvailableSlots] Time filters:');
  console.log('  Current time (UTC):', now.toISOString());
  console.log('  Current time (Dubai):', new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'long'
  }).format(now));
  console.log('  Min notice cutoff (UTC):', new Date(minNoticeTime).toISOString());
  console.log('  Min notice cutoff (Dubai):', new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(minNoticeTime)));
  console.log('  ⚠️ Any slot before', new Date(minNoticeTime).toISOString(), 'will be BLOCKED');
  
  console.log('[getAvailableSlots] Existing bookings:', booked?.length || 0);
  if (booked && booked.length > 0) {
    booked.forEach(apt => {
      const aptTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(apt.scheduled_time));
      console.log('    -', aptTime, '(', apt.duration_minutes, 'min )');
    });
  }
  
  console.log('[getAvailableSlots] Blocked ranges:', blocked?.length || 0);

  const slots: SlotResult[] = [];
  let totalSlotsGenerated = 0;
  let slotsBlockedByMinNotice = 0;
  let slotsBlockedByBooked = 0;
  let slotsBlockedByBlocked = 0;

  for (let dayOffset = 0; dayOffset < cappedDays; dayOffset++) {
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);

    if (date.getTime() > maxBookingTime) break;

    const dayName = DAY_NAMES[date.getDay()];
// @ts-ignore
    const dayEnabled = settings[`${dayName}_enabled`];
    
    console.log(`\n[Day ${dayOffset + 1}] ${dayName.toUpperCase()} - ${date.toISOString().split('T')[0]}`);
    
    if (!dayEnabled) {
      console.log('  ❌ Day is CLOSED (not enabled in settings)');
      continue;
    }

// @ts-ignore
    const dayStartStr = settings[`${dayName}_start`] || '09:00';
// @ts-ignore
    const dayEndStr = settings[`${dayName}_end`] || '17:00';
    const [startH, startM] = dayStartStr.split(':').map(Number);
    const [endH, endM] = dayEndStr.split(':').map(Number);
    
    console.log(`  ✅ Open: ${dayStartStr} - ${dayEndStr}`);

    // Count booked for this day
    const dayStartMs = new Date(date).setHours(0, 0, 0, 0);
    const dayEndMs = new Date(date).setHours(23, 59, 59, 999);
    const dayBookedCount = (booked || []).filter(a => {
      const t = new Date(a.scheduled_time).getTime();
      return t >= dayStartMs && t <= dayEndMs;
    }).length;

    if (dayBookedCount >= maxPerDay) {
      console.log(`  ❌ Day is FULL (${dayBookedCount}/${maxPerDay} appointments booked)`);
      continue;
    }
    console.log(`  📊 Current bookings: ${dayBookedCount}/${maxPerDay}`);

    // Generate time slots for this day
    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const step = slotDuration + bufferTime;

    let daySlotsGenerated = 0;
    let daySlotsBlockedMinNotice = 0;
    let daySlotsBlockedBooked = 0;
    let daySlotsBlockedBlocked = 0;
    
    while (currentMinutes + slotDuration <= endMinutes) {
      // Create slot time in tenant's timezone (not UTC)
      // Business hours (09:00-17:00) are in local time (e.g., Dubai time), not UTC
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;
      
      // Get date components
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      
      // Create an ISO string representing this time in the tenant's timezone
      // For Dubai (Asia/Dubai = UTC+4), we need to build: 2026-03-02T09:00:00+04:00
      // Then parse it to get the correct UTC time
      
      // Get the timezone offset for this date in the tenant's timezone
      // We'll create a reference date and format it to extract the offset
      const refDate = new Date(`${dateStr}T12:00:00Z`); // Noon UTC
      const formatted = refDate.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      });
      
      // Extract offset from formatted string (e.g., "GMT+4")
      const offsetMatch = formatted.match(/GMT([+-]\d+)/);
      const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0;
      const offsetStr = offsetHours >= 0 
        ? `+${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
        : `-${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
      
      // Build ISO string with timezone offset
      const isoWithTZ = `${dateStr}T${timeStr}${offsetStr}`;
      const slotDate = new Date(isoWithTZ);
      const slotTime = slotDate.getTime();
      
      // Log first slot generation for debugging
      if (dayOffset === 0 && currentMinutes === startH * 60 + startM) {
        console.log('[CHECK_CALENDAR] Sample slot BEFORE formatting:', {
          dateStr,
          timeStr,
          offsetStr,
          isoWithTZ,
          slotTime: new Date(slotTime).toISOString()
        });
      }
      const slotTimeStr = slotDate.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      totalSlotsGenerated++;

      // Skip if before minimum notice
      if (slotTime < minNoticeTime) {
        const hoursUntil = (slotTime - now.getTime()) / (1000 * 60 * 60);
        console.log(`    ⏰ ${slotTimeStr} - BLOCKED (min notice: ${hoursUntil.toFixed(1)}h < ${minNoticeHours}h)`);
        slotsBlockedByMinNotice++;
        daySlotsBlockedMinNotice++;
        currentMinutes += step;
        continue;
      }

      // Skip if already booked
      if (bookedTimes.has(slotTime)) {
        console.log(`    📅 ${slotTimeStr} - BLOCKED (already booked)`);
        slotsBlockedByBooked++;
        daySlotsBlockedBooked++;
        currentMinutes += step;
        continue;
      }

      // Skip if in a blocked range
      const slotEnd = slotTime + slotDuration * 60 * 1000;
      const isBlocked = blockedRanges.some(
        r => slotTime < r.end && slotEnd > r.start
      );
      if (isBlocked) {
        console.log(`    🚫 ${slotTimeStr} - BLOCKED (in blocked range)`);
        slotsBlockedByBlocked++;
        daySlotsBlockedBlocked++;
        currentMinutes += step;
        continue;
      }
      
      console.log(`    ✅ ${slotTimeStr} - AVAILABLE`);
      daySlotsGenerated++;

      const slotObj = {
        datetime: slotDate.toISOString(),
        formatted: slotDate.toLocaleString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
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
        dayName: slotDate.toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: timezone,
        }),
        dateOnly: slotDate.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          timeZone: timezone,
        }),
      };
      
      // Log first slot after formatting
      if (dayOffset === 0 && currentMinutes === startH * 60 + startM) {
        console.log('[CHECK_CALENDAR] Sample slot AFTER formatting:', slotObj);
      }
      
      slots.push(slotObj);

      currentMinutes += step;
    }
    
    console.log(`  📊 Day summary: ${daySlotsGenerated} available, ${daySlotsBlockedMinNotice} blocked by min notice, ${daySlotsBlockedBooked} booked, ${daySlotsBlockedBlocked} blocked`);
  }
  
  console.log('\n[getAvailableSlots] FINAL SUMMARY:');
  console.log('  Total slots checked:', totalSlotsGenerated);
  console.log('  Slots blocked by min notice:', slotsBlockedByMinNotice, '⚠️ MOST COMMON REASON');
  console.log('  Slots blocked by bookings:', slotsBlockedByBooked);
  console.log('  Slots blocked by blocked ranges:', slotsBlockedByBlocked);
  console.log('  Slots AVAILABLE:', slots.length);
  console.log('=== END GET AVAILABLE SLOTS ===\n');

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
  const eventId = `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Verify slot is still available
  const available = await isSlotAvailable(params.tenantId, params.scheduledAt, duration);
  if (!available) {
    return { success: false, error: 'Slot is no longer available' };
  }

  console.log('[BOOK_SLOT] Saving to database:', {
    scheduledAt: params.scheduledAt,
    type: typeof params.scheduledAt,
    parsedAsDate: new Date(params.scheduledAt).toISOString(),
    parsedAsDubai: new Date(params.scheduledAt).toLocaleString('en-US', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'full',
      timeStyle: 'long'
    })
  });
  
  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      tenant_id: params.tenantId,
      contact_id: params.contactId || null,
      scheduled_time: params.scheduledAt,
      duration: duration,
      duration_minutes: duration,
      status: 'scheduled',
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_email: params.customerEmail || null,
      appointment_type: params.appointmentType || 'general',
      notes: params.notes || null,
      booked_via: params.bookedVia || 'whatsapp',
      conversation_id: params.conversationId || null,
      calendar_provider: 'inapp',
      calendar_event_id: eventId,
    })
    .select()
    .single();

  if (error) {
    console.error('[InApp Calendar] Book error:', error);

    const { data: legacyAppointment, error: legacyError } = await supabaseAdmin
      .from('appointments')
      .insert({
        tenant_id: params.tenantId,
        contact_id: params.contactId || null,
        conversation_id: params.conversationId || null,
        scheduled_time: params.scheduledAt,
        duration_minutes: duration,
        status: 'scheduled',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (legacyError) {
      console.error('[InApp Calendar] Legacy book error:', legacyError);
      return { success: false, error: legacyError.message };
    }

    return { success: true, appointment: legacyAppointment };
  }

  return { success: true, appointment };
}
