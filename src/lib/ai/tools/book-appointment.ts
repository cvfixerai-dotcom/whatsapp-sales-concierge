// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { updateLead } from './update-lead';
import { sendEmail } from './send-email';
import { bookSlot } from '../../services/calendar/inapp';
import { GoogleCalendarProvider } from '../../services/calendar/google';

interface BookingParams {
  tenantId: string;
  contactId: string;
  conversationId: string;
  slotTime: string;
}

/**
 * Validates that the input is an ISO 8601 datetime string.
 * Throws if not — the AI must always pass an exact ISO from the offered slots.
 */
function assertIsoDateTime(value: string): void {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new Error(
      `book_appointment requires an ISO datetime string (e.g. "2025-02-26T10:00:00.000Z"). ` +
      `Received: "${value}". Use check_calendar first and pass the exact datetime from the results.`
    );
  }
}

/**
 * Resolves the slot by matching the provided ISO datetime against
 * contacts.metadata.calendar_last_slots (the slots most recently offered by check_calendar).
 * Returns null if no exact match is found — no global fallback.
 */
async function resolveFromLastOfferedSlots(
  isoDatetime: string,
  contactId: string
): Promise<string | null> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('metadata')
    .eq('id', contactId)
    .single();

  const lastSlots: any[] = Array.isArray(contact?.metadata?.calendar_last_slots)
    ? contact.metadata.calendar_last_slots
    : [];

  if (!lastSlots.length) {
    return null;
  }

  const inputMs = new Date(isoDatetime).getTime();
  const match = lastSlots.find(slot => {
    const slotMs = new Date(slot.datetime).getTime();
    return slotMs === inputMs;
  });

  return match ? match.datetime : null;
}

/**
 * Book an appointment slot
 * 
 * TIMEZONE PHILOSOPHY:
 * - Accepts ISO datetime from check_calendar (already in business timezone as UTC)
 * - NO user timezone detection (no phone number → timezone mapping)
 * - NO timezone conversion based on user location
 * - Simply validates and books the slot as-is
 * 
 * When user says "2pm", we assume they mean 2pm business time.
 * The ISO datetime from check_calendar already represents this.
 */
export async function bookAppointment({
  tenantId,
  contactId,
  conversationId,
  slotTime,
}: BookingParams): Promise<{
  success: boolean;
  meeting_link?: string;
  meeting_time?: string;
  confirmed_iso?: string;
  error?: string;
}> {
  try {
    // Log tool call with clean parameter summary
    console.log('\n=== 📝 BOOK APPOINTMENT TOOL ===');
    console.log('[Tool: book_appointment] ✅ CALLED with parameters:', {
      tenantId: tenantId.substring(0, 8) + '...',
      contactId: contactId.substring(0, 8) + '...',
      conversationId: conversationId.substring(0, 8) + '...',
      slotTime: slotTime
    });

    // 1. Hard reject non-ISO input — no natural language accepted
    assertIsoDateTime(slotTime);
    console.log(`[Tool: bookAppointment] ✅ ISO format validated`);

    // 2. Resolve against last offered slots only — no global slot search fallback
    // No timezone conversion here - slot is already in business timezone (as UTC)
    const resolvedIso = await resolveFromLastOfferedSlots(slotTime, contactId);
    console.log(`[Tool: book_appointment] Resolved from last offered slots:`, {
      input: slotTime,
      resolved: resolvedIso || 'NOT FOUND',
      parsedUTC: new Date(slotTime).toISOString()
    });

    if (!resolvedIso) {
      console.error('[Tool: bookAppointment] ❌ SLOT NOT FOUND IN LAST OFFERED SLOTS');
      console.error('[Tool: bookAppointment] This means check_calendar was not called, or AI passed wrong datetime');
      console.error('[Tool: bookAppointment] Slot time received:', slotTime);
      return {
        success: false,
        error:
          'The selected time was not in the recently offered slots. Please use check_calendar again and select one of the returned datetimes.',
      };
    }

    // 3. Load tenant and contact
    const [{ data: tenant, error: tenantError }, { data: contact, error: contactError }] =
      await Promise.all([
        supabaseAdmin
          .from('tenants')
          .select('company_name, language, business_hours, timezone, calendar_provider, google_refresh_token, google_calendar_id')
          .eq('id', tenantId)
          .single(),
        supabaseAdmin
          .from('contacts')
          .select('name, email, whatsapp_number, language')
          .eq('id', contactId)
          .single(),
      ]);

    if (tenantError || !tenant) {
      console.error('[Tool: bookAppointment] Tenant fetch error:', JSON.stringify(tenantError));
      return { success: false, error: 'Tenant configuration not found' };
    }
    if (contactError || !contact) {
      console.error('[Tool: bookAppointment] Contact fetch error:', JSON.stringify(contactError));
      return { success: false, error: 'Contact not found' };
    }

    const inviteeEmail =
      contact.email ||
      `${contact.whatsapp_number.replace('whatsapp:', '').replace('+', '')}@wa.placeholder`;
    const inviteeName = contact.name || 'Customer';
    const companyName = tenant.company_name || 'Our Team';

    // 4. Book the slot
    console.log('[Tool: bookAppointment] Booking slot with:', {
      scheduledAt: resolvedIso,
      customerName: inviteeName,
      customerEmail: inviteeEmail,
      duration: 30,
    });
    
    const bookingResult = await bookSlot({
      tenantId,
      scheduledAt: resolvedIso,
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

    // 5. Validate DB insert returned a real row
    const appointmentId = bookingResult.appointment?.id;
    if (!appointmentId) {
      throw new Error('Booking insert returned no row — appointment ID is missing.');
    }

    console.log(`[Tool: bookAppointment] ✅ BOOKING SUCCESSFUL`);
    console.log(`[Tool: bookAppointment] Appointment ID: ${appointmentId}`);
    console.log(`[Tool: bookAppointment] Scheduled time (UTC): ${resolvedIso}`);
    console.log(`[Tool: bookAppointment] Database record:`, bookingResult.appointment);

    // 5b. If Google Calendar is configured, create event there too
    let googleEventId: string | undefined;
    let googleMeetLink: string | undefined;
    
    if (tenant.calendar_provider === 'google' && tenant.google_refresh_token && tenant.google_calendar_id) {
      console.log('[Tool: bookAppointment] Creating Google Calendar event...');
      try {
        const googleProvider = new GoogleCalendarProvider();
        const googleResult = await googleProvider.bookAppointment(
          {
            googleCalendarId: tenant.google_calendar_id,
            googleRefreshToken: tenant.google_refresh_token,
            timezone: tenant.timezone || 'Asia/Dubai',
          },
          resolvedIso,
          {
            name: inviteeName,
            email: inviteeEmail,
            phone: contact.whatsapp_number,
          },
          {
            title: `${companyName} - ${inviteeName}`,
            description: `Booked via WhatsApp\nPhone: ${contact.whatsapp_number}`,
            duration: 30,
          }
        );

        if (googleResult.success) {
          googleEventId = googleResult.eventId;
          googleMeetLink = googleResult.meetingLink;
          console.log(`[Tool: bookAppointment] ✅ Google Calendar event created: ${googleEventId}`);
          
          // Update appointment record with Google event details
          await supabaseAdmin
            .from('appointments')
            .update({
              calendar_event_id: googleEventId,
              meeting_link: googleMeetLink,
              calendar_provider: 'google',
            })
            .eq('id', appointmentId);
        } else {
          console.warn('[Tool: bookAppointment] Google Calendar event creation failed (non-fatal):', googleResult.error);
        }
      } catch (googleError) {
        console.error('[Tool: bookAppointment] Google Calendar error (non-fatal):', googleError);
      }
    }

    console.log('=== END BOOK APPOINTMENT ===\n');

    // 6. Update contact
    await updateLead({
      contactId,
      updates: {
        temperature: 'booked',
        qualification_status: 'contacted',
        metadata: {
          last_booking_at: new Date().toISOString(),
          calendar_provider: tenant.calendar_provider || 'inapp',
          appointment_id: appointmentId,
          google_event_id: googleEventId,
        },
      },
    });

    // 7. Send confirmation email (non-fatal)
    if (contact.email && !contact.email.includes('@wa.placeholder')) {
      try {
        await sendEmail({
          to: contact.email,
          template: 'booking_confirmation',
          data: {
            company_name: companyName,
            meeting_time: resolvedIso,
            meeting_link: googleMeetLink || 'Details will be shared before the meeting',
            customer_name: inviteeName,
          },
        });
      } catch (emailError) {
        console.error('[Tool: bookAppointment] Email sending failed (non-fatal):', emailError);
      }
    }

    // 8. Return confirmed ISO — agent.ts will format the confirmation message, not the AI
    return {
      success: true,
      confirmed_iso: resolvedIso,
      meeting_link: googleMeetLink,
    };
  } catch (error) {
    console.error('[Tool: bookAppointment] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
