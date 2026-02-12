// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { calendarService, CalendarConfig, CalendarProvider } from '../../services/calendar';

interface CheckCalendarParams {
  tenantId: string;
  preferredDate?: string;
}

interface CalendarSlot {
  datetime: string;
  formatted: string;
}

export async function checkCalendar({ tenantId, preferredDate }: CheckCalendarParams): Promise<{
  success: boolean;
  available_slots?: CalendarSlot[];
  error?: string;
}> {
  try {
    console.log(`[Tool: checkCalendar] Checking availability for tenant ${tenantId}, preferredDate=${preferredDate || 'none'}`);

    // Get tenant configuration
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('calendar_provider, calendly_api_key, calendly_event_url, google_calendar_id, google_refresh_token, language, business_hours')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('[Tool: checkCalendar] Tenant not found:', tenantId, tenantError);
      return {
        success: false,
        error: 'Tenant configuration not found',
      };
    }

    // Determine calendar provider (default to calendly for backward compatibility)
    const provider: CalendarProvider = tenant.calendar_provider || 'calendly';
    console.log(`[Tool: checkCalendar] Provider: ${provider}, calendly_key: ${tenant.calendly_api_key ? 'SET' : 'MISSING'}, calendly_url: ${tenant.calendly_event_url || 'MISSING'}, google_cal: ${tenant.google_calendar_id || 'MISSING'}`);
    
    // Build calendar config based on provider
    const calendarConfig: CalendarConfig = {
      provider,
      businessHours: tenant.business_hours,
      timezone: tenant.business_hours?.timezone || 'UTC',
    };

    if (provider === 'calendly') {
      if (!tenant.calendly_api_key || !tenant.calendly_event_url) {
        console.error('[Tool: checkCalendar] Calendly not configured — key or URL missing');
        // Return business hours as fallback instead of failing
        return {
          success: true,
          available_slots: generateBusinessHourSlots(tenant.business_hours),
          fallback: true,
          error_detail: 'Calendly not fully configured, showing business hours instead',
        };
      }
      calendarConfig.calendlyApiKey = tenant.calendly_api_key;
      calendarConfig.calendlyEventUrl = tenant.calendly_event_url;
    } else if (provider === 'google') {
      if (!tenant.google_calendar_id || !tenant.google_refresh_token) {
        console.error('[Tool: checkCalendar] Google Calendar not configured');
        return {
          success: true,
          available_slots: generateBusinessHourSlots(tenant.business_hours),
          fallback: true,
          error_detail: 'Google Calendar not fully configured, showing business hours instead',
        };
      }
      calendarConfig.googleCalendarId = tenant.google_calendar_id;
      calendarConfig.googleRefreshToken = tenant.google_refresh_token;
    }

    // Use the calendar service abstraction
    const result = await calendarService.checkAvailability(calendarConfig, preferredDate);

    if (!result.success) {
      console.error(`[Tool: checkCalendar] Calendar API failed: ${result.error}`);
      // Fallback to business hours instead of failing completely
      return {
        success: true,
        available_slots: generateBusinessHourSlots(tenant.business_hours),
        fallback: true,
        error_detail: result.error,
      };
    }

    console.log(`[Tool: checkCalendar] Found ${result.availableSlots?.length || 0} available slots via ${provider}`);

    // If calendar returned 0 slots, generate from business hours
    if (!result.availableSlots || result.availableSlots.length === 0) {
      return {
        success: true,
        available_slots: generateBusinessHourSlots(tenant.business_hours),
        fallback: true,
        error_detail: 'No slots from calendar API, using business hours',
      };
    }

    return {
      success: true,
      available_slots: result.availableSlots.map(slot => ({
        datetime: slot.datetime,
        formatted: slot.formatted,
      })),
    };
  } catch (error) {
    console.error('[Tool: checkCalendar] Unexpected error:', error);
    // Even on error, return business hour slots so the AI can suggest times
    return {
      success: true,
      available_slots: generateBusinessHourSlots(),
      fallback: true,
      error_detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate available slots from business hours when calendar API is unavailable.
 * Returns the next 5 available slots based on business hours config.
 */
function generateBusinessHourSlots(businessHours?: Record<string, any>): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const now = new Date();
  const timezone = businessHours?.timezone || 'UTC';
  const startHour = businessHours?.start ? parseInt(businessHours.start.split(':')[0]) : 9;
  const endHour = businessHours?.end ? parseInt(businessHours.end.split(':')[0]) : 17;
  const workDays = businessHours?.days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Generate slots for the next 7 days
  for (let dayOffset = 0; dayOffset < 7 && slots.length < 5; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dayName = dayNames[date.getDay()];

    if (!workDays.includes(dayName)) continue;

    // Generate morning and afternoon slots
    const slotHours = [startHour, startHour + 2, 12, 14, endHour - 2].filter(h => h >= startHour && h < endHour);

    for (const hour of slotHours) {
      if (slots.length >= 5) break;
      // Skip past times for today
      if (dayOffset === 0 && hour <= now.getHours()) continue;

      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);

      slots.push({
        datetime: slotDate.toISOString(),
        formatted: slotDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone,
        }),
      });
    }
  }

  // If we still have no slots, generate generic ones
  if (slots.length === 0) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const hour of [9, 11, 14]) {
      const slotDate = new Date(tomorrow);
      slotDate.setHours(hour, 0, 0, 0);
      slots.push({
        datetime: slotDate.toISOString(),
        formatted: slotDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      });
    }
  }

  return slots;
}

function formatDateTime(datetime: string, language: string): string {
  const date = new Date(datetime);
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };

  if (language === 'ar') {
    return date.toLocaleDateString('ar-AE', options);
  }
  
  return date.toLocaleDateString('en-US', options);
}
