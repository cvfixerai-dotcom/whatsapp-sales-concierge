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
    console.log(`[Tool: checkCalendar] Checking availability for tenant ${tenantId}`);

    // Get tenant configuration
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('calendar_provider, calendly_api_key, calendly_event_url, google_calendar_id, google_refresh_token, language, business_hours')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('[Tool: checkCalendar] Tenant not found:', tenantId);
      return {
        success: false,
        error: 'Tenant configuration not found',
      };
    }

    // Determine calendar provider (default to calendly for backward compatibility)
    const provider: CalendarProvider = tenant.calendar_provider || 'calendly';
    
    // Build calendar config based on provider
    const calendarConfig: CalendarConfig = {
      provider,
      businessHours: tenant.business_hours,
      timezone: tenant.business_hours?.timezone || 'UTC',
    };

    if (provider === 'calendly') {
      if (!tenant.calendly_api_key || !tenant.calendly_event_url) {
        console.error('[Tool: checkCalendar] Calendly not configured for tenant');
        return {
          success: false,
          error: 'Calendly integration not configured. Please add your Calendly API key and event URL.',
        };
      }
      calendarConfig.calendlyApiKey = tenant.calendly_api_key;
      calendarConfig.calendlyEventUrl = tenant.calendly_event_url;
    } else if (provider === 'google') {
      if (!tenant.google_calendar_id || !tenant.google_refresh_token) {
        console.error('[Tool: checkCalendar] Google Calendar not configured for tenant');
        return {
          success: false,
          error: 'Google Calendar integration not configured. Please connect your Google Calendar.',
        };
      }
      calendarConfig.googleCalendarId = tenant.google_calendar_id;
      calendarConfig.googleRefreshToken = tenant.google_refresh_token;
    }

    // Use the calendar service abstraction
    const result = await calendarService.checkAvailability(calendarConfig, preferredDate);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    console.log(`[Tool: checkCalendar] Found ${result.availableSlots?.length || 0} available slots via ${provider}`);

    return {
      success: true,
      available_slots: result.availableSlots?.map(slot => ({
        datetime: slot.datetime,
        formatted: slot.formatted,
      })),
    };
  } catch (error) {
    console.error('[Tool: checkCalendar] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
