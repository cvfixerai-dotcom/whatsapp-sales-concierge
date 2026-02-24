// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { updateLead } from './update-lead';
import { sendEmail } from './send-email';
import { bookSlot, getAvailableSlots } from '../../services/calendar/inapp';

interface BookingParams {
  tenantId: string;
  contactId: string;
  conversationId: string;
  slotTime: string;
}

export async function bookAppointment({
  tenantId,
  contactId,
  conversationId,
  slotTime
}: BookingParams): Promise<{
  success: boolean;
  meeting_link?: string;
  meeting_time?: string;
  error?: string;
}> {
  try {
    console.log(`[Tool: bookAppointment] Booking appointment for contact ${contactId}`);

    // Get tenant configuration
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('company_name, language, business_hours, timezone')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('[Tool: bookAppointment] Tenant not found:', tenantId);
      return {
        success: false,
        error: 'Tenant configuration not found',
      };
    }

    // Get contact information
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('name, email, whatsapp_number, language')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      console.error('[Tool: bookAppointment] Contact not found:', contactId);
      return {
        success: false,
        error: 'Contact not found',
      };
    }

    // Prepare invitee data
    const inviteeEmail = contact.email || `${contact.whatsapp_number.replace('whatsapp:', '').replace('+', '')}@wa.placeholder`;
    const inviteeName = contact.name || 'Customer';
    const companyName = tenant.company_name || 'Our Team';

    const resolvedSlotTime = await resolveSlotTime(slotTime, tenantId, tenant.timezone);

    if (!resolvedSlotTime) {
      console.warn('[Tool: bookAppointment] Unable to resolve slot time:', slotTime);
      return {
        success: false,
        error: 'Selected time is not available. Please choose one of the offered slots.',
      };
    }

    console.log(`[Tool: bookAppointment] Resolved slot time: ${slotTime} -> ${resolvedSlotTime}`);

    // Use in-app booking only
    const bookingResult = await bookSlot({
      tenantId,
      scheduledAt: resolvedSlotTime,
      contactId,
      conversationId,
      customerName: inviteeName,
      customerEmail: inviteeEmail,
      customerPhone: contact.whatsapp_number,
      duration: 30,
      appointmentType: 'consultation',
      bookedVia: 'whatsapp',
    });

    if (!bookingResult.success) {
      console.error('[Tool: bookAppointment] Booking failed:', bookingResult.error);
      return { success: false, error: bookingResult.error || 'Failed to book appointment' };
    }

    console.log('[Tool: bookAppointment] Appointment booked successfully via in-app calendar');

    // Update contact temperature to 'booked'
    await updateLead({
      contactId,
      updates: { 
        temperature: 'booked',
        qualification_status: 'contacted',
        metadata: {
          last_booking_at: new Date().toISOString(),
          calendar_provider: 'inapp',
          appointment_id: bookingResult.appointment?.id,
        }
      },
    });

    // Send confirmation email if email exists and is not a placeholder
    const formattedTime = formatDateTime(
      resolvedSlotTime,
      contact.language || tenant.language || 'en',
      tenant.timezone
    );
    if (contact.email && !contact.email.includes('@wa.placeholder')) {
      try {
        await sendEmail({
          to: contact.email,
          template: 'booking_confirmation',
          data: {
            company_name: companyName,
            meeting_time: formattedTime,
            meeting_link: 'Details will be shared before the meeting',
            customer_name: inviteeName,
          },
        });
      } catch (emailError) {
        console.error('[Tool: bookAppointment] Email sending failed:', emailError);
        // Don't fail the booking if email fails
      }
    }

    return {
      success: true,
      meeting_time: formattedTime,
    };
  } catch (error) {
    console.error('[Tool: bookAppointment] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function formatDateTime(datetime: string, language: string, timezone?: string): string {
  const date = new Date(datetime);
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: timezone || 'UTC',
  };

  if (language === 'ar') {
    return date.toLocaleDateString('ar-AE', options);
  }
  
  return date.toLocaleDateString('en-US', options);
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function extractTimeParts(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
}

function timeMatches(slotTime: string, target: { hours: number; minutes: number }): boolean {
  const match = slotTime.toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
  if (!match) return false;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours === target.hours && minutes === target.minutes;
}

function extractDayName(input: string): string | null {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days.find(day => input.includes(day)) || null;
}

function extractMonthDay(input: string): { month: string; day: number } | null {
  const monthMatch = input.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/);
  const dayMatch = input.match(/\b([0-3]?\d)(st|nd|rd|th)?\b/);
  if (!monthMatch || !dayMatch) return null;
  return { month: monthMatch[1].slice(0, 3), day: parseInt(dayMatch[1], 10) };
}

function monthDayMatches(dateOnly: string, target: { month: string; day: number }): boolean {
  const normalized = dateOnly.toLowerCase();
  return normalized.includes(target.month) && new RegExp(`\\b${target.day}\\b`).test(normalized);
}

function getDateOnlyInTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

async function resolveSlotTime(rawSlotTime: string, tenantId: string, timezone?: string): Promise<string | null> {
  if (!rawSlotTime) return null;
  if (isIsoDateTime(rawSlotTime)) return rawSlotTime;

  const input = rawSlotTime.toLowerCase();
  const timeParts = extractTimeParts(input);
  if (!timeParts) return null;

  const slots = await getAvailableSlots(tenantId, new Date(), 14);
  if (!slots.length) return null;

  let candidates = slots.filter(slot => timeMatches(slot.time, timeParts));

  const dayName = extractDayName(input);
  if (dayName) {
    candidates = candidates.filter(slot => slot.dayName.toLowerCase().startsWith(dayName));
  }

  const monthDay = extractMonthDay(input);
  if (monthDay) {
    candidates = candidates.filter(slot => monthDayMatches(slot.dateOnly, monthDay));
  }

  if (input.includes('today') || input.includes('tomorrow')) {
    const tz = timezone || 'UTC';
    const base = new Date();
    const baseInTz = new Date(base.toLocaleString('en-US', { timeZone: tz }));
    if (input.includes('tomorrow')) {
      baseInTz.setDate(baseInTz.getDate() + 1);
    }
    const targetDateOnly = getDateOnlyInTimezone(baseInTz, tz);
    candidates = candidates.filter(slot => slot.dateOnly === targetDateOnly);
  }

  if (!candidates.length) return null;
  return candidates[0].datetime;
}
