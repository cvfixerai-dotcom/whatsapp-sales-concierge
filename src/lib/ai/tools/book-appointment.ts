// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { updateLead } from './update-lead';
import { sendEmail } from './send-email';
import { calendarService, CalendarConfig, CalendarProvider } from '../../services/calendar';
import { isSlotAvailable } from '../../services/calendar/inapp';

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
      .select('calendar_provider, calendly_api_key, calendly_event_url, google_calendar_id, google_refresh_token, company_name, language, business_hours')
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
    const timezone = tenant.business_hours?.timezone || 'UTC';

    // Determine calendar provider and try external booking first
    const provider: CalendarProvider = tenant.calendar_provider || 'calendly';
    let meetingLink: string | undefined;
    let meetingTime: string = slotTime;
    let eventId: string | undefined;
    let usedExternalCalendar = false;

    // Try external calendar if configured
    const hasCalendly = provider === 'calendly' && tenant.calendly_api_key;
    const hasGoogle = provider === 'google' && tenant.google_calendar_id && tenant.google_refresh_token;

    if (hasCalendly || hasGoogle) {
      try {
        const calendarConfig: CalendarConfig = {
          provider,
          businessHours: tenant.business_hours,
          timezone,
        };

        if (hasCalendly) {
          calendarConfig.calendlyApiKey = tenant.calendly_api_key;
          calendarConfig.calendlyEventUrl = tenant.calendly_event_url;
        } else if (hasGoogle) {
          calendarConfig.googleCalendarId = tenant.google_calendar_id;
          calendarConfig.googleRefreshToken = tenant.google_refresh_token;
        }

        const bookingResult = await calendarService.bookAppointment(
          calendarConfig,
          slotTime,
          { name: inviteeName, email: inviteeEmail, phone: contact.whatsapp_number },
          {
            title: `Meeting with ${inviteeName}`,
            description: `Booked via WhatsApp Sales Concierge\nPhone: ${contact.whatsapp_number}`,
            duration: 60,
          }
        );

        if (bookingResult.success) {
          meetingLink = bookingResult.meetingLink;
          meetingTime = bookingResult.meetingTime || slotTime;
          eventId = bookingResult.eventId;
          usedExternalCalendar = true;
          console.log(`[Tool: bookAppointment] Booked via external calendar (${provider})`);
        } else {
          console.warn(`[Tool: bookAppointment] External calendar failed: ${bookingResult.error}. Falling back to in-app booking.`);
        }
      } catch (calError) {
        console.warn('[Tool: bookAppointment] External calendar error, falling back to in-app:', calError);
      }
    } else {
      console.log('[Tool: bookAppointment] No external calendar configured. Using in-app booking.');
    }

    // In-app booking: always save to DB regardless of external calendar result
    if (!usedExternalCalendar) {
      // Verify slot is still available before booking
      const slotFree = await isSlotAvailable(tenantId, slotTime, 30);
      if (!slotFree) {
        return { success: false, error: 'That time slot is no longer available. Please choose another time.' };
      }
      eventId = `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      meetingTime = slotTime;
    }

    // Save to database
    const appointmentPayload = {
      tenant_id: tenantId,
      contact_id: contactId,
      conversation_id: conversationId,
      calendar_provider: usedExternalCalendar ? provider : 'inapp',
      calendar_event_id: eventId,
      scheduled_time: meetingTime,
      duration: 30,
      duration_minutes: 30,
      meeting_link: meetingLink || null,
      status: 'scheduled',
      customer_name: inviteeName,
      customer_phone: contact.whatsapp_number,
      customer_email: contact.email || null,
      booked_via: 'whatsapp',
      created_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabaseAdmin
      .from('appointments')
      .insert(appointmentPayload);

    if (dbError) {
      console.error('[Tool: bookAppointment] Database insert failed:', dbError);

      const legacyPayload = {
        tenant_id: tenantId,
        contact_id: contactId,
        conversation_id: conversationId,
        calendly_event_id: provider === 'calendly' ? eventId : null,
        scheduled_time: meetingTime,
        duration_minutes: 30,
        meeting_link: meetingLink || null,
        status: 'scheduled',
        created_at: new Date().toISOString(),
      };

      const { error: legacyError } = await supabaseAdmin
        .from('appointments')
        .insert(legacyPayload);

      if (legacyError) {
        console.error('[Tool: bookAppointment] Legacy insert failed:', legacyError);
        return { success: false, error: 'Failed to record appointment.' };
      }
    }

    // Update contact temperature to 'booked'
    await updateLead({
      contactId,
      updates: { 
        temperature: 'booked',
        qualification_status: 'contacted',
        metadata: {
          last_booking_at: new Date().toISOString(),
          calendar_provider: provider,
          calendar_event_id: eventId,
        }
      },
    });

    // Send confirmation email if email exists and is not a placeholder
    const formattedTime = formatDateTime(meetingTime, contact.language || tenant.language || 'en');
    if (contact.email && !contact.email.includes('@wa.placeholder')) {
      try {
        await sendEmail({
          to: contact.email,
          template: 'booking_confirmation',
          data: {
            company_name: companyName,
            meeting_time: formattedTime || meetingTime,
            meeting_link: meetingLink || 'Details will be shared before the meeting',
            customer_name: inviteeName,
          },
        });
      } catch (emailError) {
        console.error('[Tool: bookAppointment] Email sending failed:', emailError);
        // Don't fail the booking if email fails
      }
    }

    const bookingMethod = usedExternalCalendar ? provider : 'in-app';
    console.log(`[Tool: bookAppointment] Appointment booked successfully via ${bookingMethod}`);

    return {
      success: true,
      meeting_link: meetingLink || undefined,
      meeting_time: formattedTime || meetingTime,
      booking_method: bookingMethod,
    };
  } catch (error) {
    console.error('[Tool: bookAppointment] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function formatDateTime(datetime: string, language: string): string {
  const date = new Date(datetime);
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  if (language === 'ar') {
    return date.toLocaleDateString('ar-AE', options);
  }
  
  return date.toLocaleDateString('en-US', options);
}
