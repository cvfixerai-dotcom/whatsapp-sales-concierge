// @ts-nocheck
/**
 * Calendar Service Abstraction
 * Supports multiple calendar providers: Calendly, Google Calendar
 */

import { CalendlyProvider } from './calendly';
import { GoogleCalendarProvider } from './google';

export type CalendarProvider = 'calendly' | 'google';

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
  // Calendly
  calendlyApiKey?: string;
  calendlyEventUrl?: string;
  // Google Calendar
  googleCalendarId?: string;
  googleRefreshToken?: string;
  googleAccessToken?: string;
  // Common
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
    invitee: {
      name: string;
      email: string;
      phone?: string;
    },
    eventDetails?: {
      title?: string;
      description?: string;
      duration?: number; // minutes
    }
  ): Promise<BookingResult>;
  
  cancelAppointment(config: CalendarConfig, eventId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}

/**
 * Get the appropriate calendar provider instance
 */
export function getCalendarProvider(provider: CalendarProvider): ICalendarProvider {
  switch (provider) {
    case 'calendly':
      return new CalendlyProvider();
    case 'google':
      return new GoogleCalendarProvider();
    default:
      throw new Error(`Unsupported calendar provider: ${provider}`);
  }
}

/**
 * Calendar Service - Main entry point
 */
export class CalendarService {
  private static instance: CalendarService;

  private constructor() {}

  static getInstance(): CalendarService {
    if (!CalendarService.instance) {
      CalendarService.instance = new CalendarService();
    }
    return CalendarService.instance;
  }

  /**
   * Check calendar availability for a tenant
   */
  async checkAvailability(
    tenantConfig: CalendarConfig,
    preferredDate?: string
  ): Promise<{
    success: boolean;
    availableSlots?: CalendarSlot[];
    error?: string;
  }> {
    const provider = getCalendarProvider(tenantConfig.provider);
    return provider.checkAvailability(tenantConfig, preferredDate);
  }

  /**
   * Book an appointment
   */
  async bookAppointment(
    tenantConfig: CalendarConfig,
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
    const provider = getCalendarProvider(tenantConfig.provider);
    return provider.bookAppointment(tenantConfig, slotTime, invitee, eventDetails);
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(
    tenantConfig: CalendarConfig,
    eventId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const provider = getCalendarProvider(tenantConfig.provider);
    return provider.cancelAppointment(tenantConfig, eventId);
  }
}

export const calendarService = CalendarService.getInstance();
