// @ts-nocheck
import { supabaseAdmin } from '../../db/client';
import { updateLead } from './update-lead';
import { sendEmail } from './send-email';
import { bookSlot } from '../../services/calendar/inapp';

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
      .select('company_name, language, business_hours')
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

    // Use in-app booking only
    const bookingResult = await bookSlot(
      tenantId,
      slotTime,
      {
        contactId,
        conversationId,
        customerName: inviteeName,
        customerEmail: inviteeEmail,
        customerPhone: contact.whatsapp_number,
      }
    );

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
          appointment_id: bookingResult.appointmentId,
        }
      },
    });

    // Send confirmation email if email exists and is not a placeholder
    const formattedTime = formatDateTime(slotTime, contact.language || tenant.language || 'en');
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
