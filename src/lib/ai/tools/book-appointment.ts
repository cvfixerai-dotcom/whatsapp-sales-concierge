// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { updateLead } from './update-lead';
import { sendEmail } from './send-email';
import { calendarService, CalendarConfig, CalendarProvider } from '../../services/calendar';

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

    // Determine calendar provider
    const provider: CalendarProvider = tenant.calendar_provider || 'calendly';

    // Build calendar config
    const calendarConfig: CalendarConfig = {
      provider,
      businessHours: tenant.business_hours,
      timezone: tenant.business_hours?.timezone || 'UTC',
    };

    if (provider === 'calendly') {
      if (!tenant.calendly_api_key) {
        console.error('[Tool: bookAppointment] Calendly not configured');
        return {
          success: false,
          error: 'Calendly integration not configured',
        };
      }
      calendarConfig.calendlyApiKey = tenant.calendly_api_key;
      calendarConfig.calendlyEventUrl = tenant.calendly_event_url;
    } else if (provider === 'google') {
      if (!tenant.google_calendar_id || !tenant.google_refresh_token) {
        console.error('[Tool: bookAppointment] Google Calendar not configured');
        return {
          success: false,
          error: 'Google Calendar integration not configured',
        };
      }
      calendarConfig.googleCalendarId = tenant.google_calendar_id;
      calendarConfig.googleRefreshToken = tenant.google_refresh_token;
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

    // Book via calendar service
    const bookingResult = await calendarService.bookAppointment(
      calendarConfig,
      slotTime,
      {
        name: inviteeName,
        email: inviteeEmail,
        phone: contact.whatsapp_number,
      },
      {
        title: `Meeting with ${inviteeName}`,
        description: `Booked via WhatsApp Sales Concierge\nPhone: ${contact.whatsapp_number}`,
        duration: 60,
      }
    );

    if (!bookingResult.success) {
      console.error('[Tool: bookAppointment] Booking failed:', bookingResult.error);
      return {
        success: false,
        error: bookingResult.error || 'Failed to book appointment',
      };
    }

    const meetingLink = bookingResult.meetingLink;
    const meetingTime = bookingResult.meetingTime || slotTime;
    const eventId = bookingResult.eventId;

    // Save to database
    const { error: dbError } = await supabaseAdmin
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        conversation_id: conversationId,
        calendar_provider: provider,
        calendar_event_id: eventId,
        scheduled_time: meetingTime,
        meeting_link: meetingLink,
        status: 'scheduled',
        created_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error('[Tool: bookAppointment] Database insert failed:', dbError);
      // Don't fail the booking if DB insert fails
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
    if (contact.email && !contact.email.includes('@wa.placeholder')) {
      try {
        await sendEmail({
          to: contact.email,
          template: 'booking_confirmation',
          data: {
            company_name: tenant.company_name,
            meeting_time: formatDateTime(meetingTime, contact.language || tenant.language || 'en'),
            meeting_link: meetingLink,
            customer_name: contact.name,
          },
        });
      } catch (emailError) {
        console.error('[Tool: bookAppointment] Email sending failed:', emailError);
        // Don't fail the booking if email fails
      }
    }

    console.log(`[Tool: bookAppointment] Appointment booked successfully via ${provider}`);

    return {
      success: true,
      meeting_link: meetingLink,
      meeting_time: meetingTime,
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
