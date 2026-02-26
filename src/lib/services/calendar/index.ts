// @ts-nocheck
/**
 * Calendar Service — Internal In-App Calendar Only
 * Calendly and Google Calendar integrations have been removed.
 */

import { InAppCalendarProvider } from './inapp';

export type CalendarProvider = 'inapp';

export interface CalendarSlot {
  datetime: string;
  formatted: string;
  endTime?: string;
}

export interface BookingResult {
  success: boolean;
  eventId?: string;
  meetingLink?: string;
  meetingTime?: string;
  error?: string;
}

export interface CalendarConfig {
  provider: CalendarProvider;
  businessHours?: Record<string, any>;
  timezone?: string;
}

export interface ICalendarProvider {
  checkAvailability(config: CalendarConfig, preferredDate?: string): Promise<{
    success: boolean;
    availableSlots?: CalendarSlot[];
    error?: string;
  }>;
  bookAppointment(
    config: CalendarConfig,
    slotTime: string,
    invitee: { name: string; email: string; phone?: string },
    eventDetails?: { title?: string; description?: string; duration?: number }
  ): Promise<BookingResult>;
  cancelAppointment(config: CalendarConfig, eventId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export function getCalendarProvider(_provider: CalendarProvider): ICalendarProvider {
  return new InAppCalendarProvider();
}

export class CalendarService {
  private static instance: CalendarService;
  private constructor() {}
  static getInstance(): CalendarService {
    if (!CalendarService.instance) CalendarService.instance = new CalendarService();
    return CalendarService.instance;
  }

  async checkAvailability(tenantConfig: CalendarConfig, preferredDate?: string) {
    return getCalendarProvider(tenantConfig.provider).checkAvailability(tenantConfig, preferredDate);
  }

  async bookAppointment(tenantConfig: CalendarConfig, slotTime: string, invitee: { name: string; email: string; phone?: string }, eventDetails?: { title?: string; description?: string; duration?: number }) {
    return getCalendarProvider(tenantConfig.provider).bookAppointment(tenantConfig, slotTime, invitee, eventDetails);
  }

  async cancelAppointment(tenantConfig: CalendarConfig, eventId: string) {
    return getCalendarProvider(tenantConfig.provider).cancelAppointment(tenantConfig, eventId);
  }
}

export const calendarService = CalendarService.getInstance();
