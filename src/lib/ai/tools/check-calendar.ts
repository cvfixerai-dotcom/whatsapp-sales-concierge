// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { calendarService, CalendarConfig, CalendarProvider } from '../../services/calendar';
import { getAvailableSlots } from '../../services/calendar/inapp';

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
      return { success: false, error: 'Tenant configuration not found' };
    }

    const provider: CalendarProvider = tenant.calendar_provider || 'calendly';
    console.log(`[Tool: checkCalendar] Provider: ${provider}`);

    // --- Try external calendar first if fully configured ---
    const hasCalendly = provider === 'calendly' && tenant.calendly_api_key && tenant.calendly_event_url;
    const hasGoogle = provider === 'google' && tenant.google_calendar_id && tenant.google_refresh_token;

    if (hasCalendly || hasGoogle) {
      try {
        const calendarConfig: CalendarConfig = {
          provider,
          businessHours: tenant.business_hours,
          timezone: tenant.business_hours?.timezone || 'UTC',
        };
        if (hasCalendly) {
          calendarConfig.calendlyApiKey = tenant.calendly_api_key;
          calendarConfig.calendlyEventUrl = tenant.calendly_event_url;
        } else {
          calendarConfig.googleCalendarId = tenant.google_calendar_id;
          calendarConfig.googleRefreshToken = tenant.google_refresh_token;
        }

        const result = await calendarService.checkAvailability(calendarConfig, preferredDate);

        if (result.success && result.availableSlots && result.availableSlots.length > 0) {
          console.log(`[Tool: checkCalendar] Got ${result.availableSlots.length} slots from ${provider}`);
          return {
            success: true,
            available_slots: result.availableSlots.map(s => ({ datetime: s.datetime, formatted: s.formatted })),
          };
        }
        console.log(`[Tool: checkCalendar] External calendar returned 0 slots, falling back to in-app`);
      } catch (extErr) {
        console.warn(`[Tool: checkCalendar] External calendar error, using in-app fallback:`, extErr);
      }
    } else {
      console.log(`[Tool: checkCalendar] No external calendar configured, using in-app calendar`);
    }

    // --- In-app calendar (primary path) ---
    const startDate = preferredDate ? new Date(preferredDate) : new Date();
    const inappSlots = await getAvailableSlots(tenantId, startDate, 7);

    console.log(`[Tool: checkCalendar] In-app calendar returned ${inappSlots.length} slots`);

    return {
      success: true,
      available_slots: inappSlots.map(s => ({ datetime: s.datetime, formatted: s.formatted })),
    };
  } catch (error) {
    console.error('[Tool: checkCalendar] Unexpected error:', error);
    // Emergency: still try in-app
    try {
      const slots = await getAvailableSlots(tenantId, new Date(), 7);
      return { success: true, available_slots: slots.map(s => ({ datetime: s.datetime, formatted: s.formatted })) };
    } catch (_) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
