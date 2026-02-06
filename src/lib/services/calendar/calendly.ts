// @ts-nocheck
/**
 * Calendly Calendar Provider
 */

import { ICalendarProvider, CalendarConfig, CalendarSlot, BookingResult } from './index';

export class CalendlyProvider implements ICalendarProvider {
  
  /**
   * Check availability via Calendly API
   */
  async checkAvailability(
    config: CalendarConfig,
    preferredDate?: string
  ): Promise<{
    success: boolean;
    availableSlots?: CalendarSlot[];
    error?: string;
  }> {
    try {
      if (!config.calendlyApiKey || !config.calendlyEventUrl) {
        return {
          success: false,
          error: 'Calendly not configured',
        };
      }

      // Calculate date range
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // 2 weeks

      // Get event type URI
      const eventTypeUri = config.calendlyEventUrl.includes('event_types')
        ? config.calendlyEventUrl
        : `https://api.calendly.com/event_types/${config.calendlyEventUrl}`;

      // Call Calendly API for available times
      const response = await fetch(
        `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${startDate.toISOString()}&end_time=${endDate.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${config.calendlyApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Calendly] API error:', errorText);
        return {
          success: false,
          error: 'Failed to fetch calendar availability',
        };
      }

      const data = await response.json();

      if (!data.collection || data.collection.length === 0) {
        return {
          success: true,
          availableSlots: [],
        };
      }

      // Format slots
      const availableSlots: CalendarSlot[] = data.collection
        .slice(0, 10)
        .map((slot: any) => ({
          datetime: slot.start_time,
          formatted: this.formatDateTime(slot.start_time, config.timezone),
          endTime: slot.end_time,
        }));

      return {
        success: true,
        availableSlots,
      };
    } catch (error) {
      console.error('[Calendly] Error checking availability:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Book appointment via Calendly
   */
  async bookAppointment(
    config: CalendarConfig,
    slotTime: string,
    invitee: {
      name: string;
      email: string;
      phone?: string;
    },
    eventDetails?: {
      title?: string;
      description?: string;
      duration?: number;
    }
  ): Promise<BookingResult> {
    try {
      if (!config.calendlyApiKey || !config.calendlyEventUrl) {
        return {
          success: false,
          error: 'Calendly not configured',
        };
      }

      // Get event type URI
      const eventTypeUri = config.calendlyEventUrl.includes('event_types')
        ? config.calendlyEventUrl
        : `https://api.calendly.com/event_types/${config.calendlyEventUrl}`;

      // Create scheduling link for the invitee
      const response = await fetch('https://api.calendly.com/scheduling_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.calendlyApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_event_count: 1,
          owner: eventTypeUri,
          owner_type: 'EventType',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Calendly] Booking error:', errorText);
        return {
          success: false,
          error: 'Failed to create booking link',
        };
      }

      const data = await response.json();
      const bookingUrl = data.resource?.booking_url;

      // Note: Calendly doesn't allow direct booking via API for most plans
      // We return the booking link for the customer to complete
      return {
        success: true,
        meetingLink: bookingUrl,
        meetingTime: slotTime,
      };
    } catch (error) {
      console.error('[Calendly] Error booking appointment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cancel appointment via Calendly
   */
  async cancelAppointment(
    config: CalendarConfig,
    eventId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      if (!config.calendlyApiKey) {
        return {
          success: false,
          error: 'Calendly not configured',
        };
      }

      const response = await fetch(
        `https://api.calendly.com/scheduled_events/${eventId}/cancellation`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.calendlyApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'Cancelled by system',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Calendly] Cancel error:', errorText);
        return {
          success: false,
          error: 'Failed to cancel appointment',
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[Calendly] Error cancelling appointment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private formatDateTime(isoString: string, timezone?: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC',
    });
  }
}
