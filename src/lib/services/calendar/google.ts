// @ts-nocheck
/**
 * Google Calendar Provider
 * Supports Google Workspace Calendar integration
 */

import { ICalendarProvider, CalendarConfig, CalendarSlot, BookingResult } from './index';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarProvider implements ICalendarProvider {
  
  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        console.error('[Google Calendar] Missing OAuth credentials');
        return null;
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Google Calendar] Token refresh failed:', error);
        return null;
      }

      const data = await response.json();
      return data.access_token;
    } catch (error) {
      console.error('[Google Calendar] Error refreshing token:', error);
      return null;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  private async getAccessToken(config: CalendarConfig): Promise<string | null> {
    // If we have a valid access token, use it
    if (config.googleAccessToken) {
      return config.googleAccessToken;
    }

    // Otherwise, refresh using the refresh token
    if (config.googleRefreshToken) {
      return this.refreshAccessToken(config.googleRefreshToken);
    }

    return null;
  }

  /**
   * Check availability via Google Calendar API
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
      if (!config.googleCalendarId || !config.googleRefreshToken) {
        return {
          success: false,
          error: 'Google Calendar not configured',
        };
      }

      const accessToken = await this.getAccessToken(config);
      if (!accessToken) {
        return {
          success: false,
          error: 'Failed to authenticate with Google Calendar',
        };
      }

      // Calculate date range
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // 2 weeks

      console.log('[Google Cal Debug] timeMin:', startDate.toISOString());
      console.log('[Google Cal Debug] timeMax:', endDate.toISOString());
      console.log('[Google Cal Debug] timezone:', config.timezone || 'UTC');
      console.log('[Google Cal Debug] businessHours:', JSON.stringify(config.businessHours, null, 2));

      // Get busy times from Google Calendar
      const freeBusyResponse = await fetch(
        `${GOOGLE_CALENDAR_API}/freeBusy`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            timeZone: config.timezone || 'UTC',
            items: [{ id: config.googleCalendarId }],
          }),
        }
      );

      if (!freeBusyResponse.ok) {
        const errorText = await freeBusyResponse.text();
        console.error('[Google Calendar] FreeBusy API error:', errorText);
        return {
          success: false,
          error: 'Failed to fetch calendar availability',
        };
      }

      const freeBusyData = await freeBusyResponse.json();
      const busyTimes = freeBusyData.calendars?.[config.googleCalendarId]?.busy || [];

      console.log('[Google Cal Debug] FreeBusy response:', JSON.stringify(freeBusyData, null, 2));
      console.log('[Google Cal Debug] Busy times count:', busyTimes.length);
      console.log('[Google Cal Debug] Busy times:', busyTimes);

      // Generate available slots based on business hours
      const availableSlots = this.generateAvailableSlots(
        startDate,
        endDate,
        busyTimes,
        config.businessHours,
        config.timezone
      );

      console.log('[Google Cal Debug] Slots generated:', availableSlots.length);
      if (availableSlots.length > 0) {
        console.log('[Google Cal Debug] First 3 slots:', availableSlots.slice(0, 3));
      } else {
        console.log('[Google Cal Debug] ⚠️ NO SLOTS GENERATED');
      }

      return {
        success: true,
        availableSlots: availableSlots.slice(0, 10),
      };
    } catch (error) {
      console.error('[Google Calendar] Error checking availability:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Book appointment via Google Calendar
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
      if (!config.googleCalendarId || !config.googleRefreshToken) {
        return {
          success: false,
          error: 'Google Calendar not configured',
        };
      }

      const accessToken = await this.getAccessToken(config);
      if (!accessToken) {
        return {
          success: false,
          error: 'Failed to authenticate with Google Calendar',
        };
      }

      const startTime = new Date(slotTime);
      const duration = eventDetails?.duration || 60; // Default 60 minutes
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      // Create event
      const eventResponse = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(config.googleCalendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: eventDetails?.title || `Meeting with ${invitee.name}`,
            description: eventDetails?.description || `Booked via WhatsApp\nPhone: ${invitee.phone || 'N/A'}`,
            start: {
              dateTime: startTime.toISOString(),
              timeZone: config.timezone || 'UTC',
            },
            end: {
              dateTime: endTime.toISOString(),
              timeZone: config.timezone || 'UTC',
            },
            attendees: [
              { email: invitee.email, displayName: invitee.name },
            ],
            conferenceData: {
              createRequest: {
                requestId: `whatsapp-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 15 },
              ],
            },
          }),
        }
      );

      if (!eventResponse.ok) {
        const errorText = await eventResponse.text();
        console.error('[Google Calendar] Event creation error:', errorText);
        return {
          success: false,
          error: 'Failed to create calendar event',
        };
      }

      const event = await eventResponse.json();

      // Extract Google Meet link if available
      const meetingLink = event.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === 'video'
      )?.uri || event.htmlLink;

      console.log(`[Google Calendar] Event created: ${event.id}`);

      return {
        success: true,
        eventId: event.id,
        meetingLink,
        meetingTime: slotTime,
      };
    } catch (error) {
      console.error('[Google Calendar] Error booking appointment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cancel appointment via Google Calendar
   */
  async cancelAppointment(
    config: CalendarConfig,
    eventId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      if (!config.googleCalendarId || !config.googleRefreshToken) {
        return {
          success: false,
          error: 'Google Calendar not configured',
        };
      }

      const accessToken = await this.getAccessToken(config);
      if (!accessToken) {
        return {
          success: false,
          error: 'Failed to authenticate with Google Calendar',
        };
      }

      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(config.googleCalendarId)}/events/${eventId}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        console.error('[Google Calendar] Cancel error:', errorText);
        return {
          success: false,
          error: 'Failed to cancel appointment',
        };
      }

      console.log(`[Google Calendar] Event cancelled: ${eventId}`);
      return { success: true };
    } catch (error) {
      console.error('[Google Calendar] Error cancelling appointment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate available time slots based on business hours and busy times
   */
  private generateAvailableSlots(
    startDate: Date,
    endDate: Date,
    busyTimes: Array<{ start: string; end: string }>,
    businessHours?: Record<string, any>,
    timezone?: string
  ): CalendarSlot[] {
    const slots: CalendarSlot[] = [];
    const slotDuration = 60; // 60 minutes per slot
    
    console.log('[Google Cal Debug] generateAvailableSlots called');
    console.log('[Google Cal Debug] businessHours param:', JSON.stringify(businessHours, null, 2));
    
    // Default business hours
    const defaultHours = {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '09:00', close: '17:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '09:00', close: '17:00' },
      saturday: null,
      sunday: null,
    };

    const hours = businessHours || defaultHours;
    console.log('[Google Cal Debug] Using hours:', JSON.stringify(hours, null, 2));
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Iterate through each day
    const currentDate = new Date(startDate);
    let daysProcessed = 0;
    while (currentDate < endDate && slots.length < 20) {
      const dayName = dayNames[currentDate.getDay()];
      const dayHours = hours[dayName];
      daysProcessed++;
      
      console.log(`[Google Cal Debug] Day ${daysProcessed}: ${dayName}, hours:`, dayHours);

      if (dayHours && dayHours.open && dayHours.close) {
        // Parse business hours
        const [openHour, openMin] = dayHours.open.split(':').map(Number);
        const [closeHour, closeMin] = dayHours.close.split(':').map(Number);

        // Generate slots for this day
        const dayStart = new Date(currentDate);
        dayStart.setHours(openHour, openMin, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(closeHour, closeMin, 0, 0);

        let slotStart = new Date(dayStart);
        
        // Skip if slot start is in the past
        const now = new Date();
        if (slotStart < now) {
          // Round up to next hour
          slotStart = new Date(now);
          slotStart.setMinutes(0, 0, 0);
          slotStart.setHours(slotStart.getHours() + 1);
        }

        while (slotStart < dayEnd && slots.length < 20) {
          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

          // Check if slot conflicts with busy times
          const isConflict = busyTimes.some(busy => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return (slotStart < busyEnd && slotEnd > busyStart);
          });

          if (!isConflict && slotStart > now) {
            slots.push({
              datetime: slotStart.toISOString(),
              formatted: this.formatDateTime(slotStart.toISOString(), timezone),
              endTime: slotEnd.toISOString(),
            });
          }

          // Move to next slot
          slotStart = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    console.log(`[Google Cal Debug] Total days processed: ${daysProcessed}`);
    console.log(`[Google Cal Debug] Total slots before filter: ${slots.length}`);
    return slots;
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
