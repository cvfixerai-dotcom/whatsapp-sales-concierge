/**
 * Calendar Provider interfaces and types
 */

export interface CalendarSlot {
  datetime: string;
  formatted: string;
  date: string;
  time: string;
  dayName: string;
  dateOnly?: string;
  endTime?: string;
}

export interface CalendarConfig {
  googleCalendarId?: string;
  googleRefreshToken?: string;
  timezone?: string;
  businessHours?: Record<string, any>;
  slotDuration?: number;
  bufferTime?: number;
}

export interface BookingResult {
  success: boolean;
  meeting_link?: string;
  meeting_time?: string;
  confirmed_iso?: string;
  calendar_event_id?: string;
  error?: string;
}

export interface ICalendarProvider {
  checkAvailability(
    config: CalendarConfig,
    preferredDate?: string
  ): Promise<{
    success: boolean;
    availableSlots?: CalendarSlot[];
    error?: string;
  }>;

  bookAppointment(
    config: CalendarConfig,
    slot: CalendarSlot,
    contactInfo: { name?: string; email?: string; phone?: string },
    notes?: string
  ): Promise<BookingResult>;

  cancelAppointment?(
    config: CalendarConfig,
    eventId: string
  ): Promise<{ success: boolean; error?: string }>;
}
