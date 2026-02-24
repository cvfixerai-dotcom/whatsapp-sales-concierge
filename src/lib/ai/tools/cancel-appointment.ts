// @ts-nocheck
import { supabaseAdmin } from '../../db/client';

interface CancelAppointmentParams {
  tenantId: string;
  contactId: string;
  appointmentId?: string;
}

export async function cancelAppointment({
  tenantId,
  contactId,
  appointmentId,
}: CancelAppointmentParams): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    console.log(`[Tool: cancelAppointment] Cancelling appointment for contact ${contactId}`);

    // If specific appointment ID is provided, cancel that one
    if (appointmentId) {
      const { error } = await supabaseAdmin
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId);

      if (error) {
        console.error('[Tool: cancelAppointment] Error:', error);
        return { success: false, error: 'Failed to cancel appointment' };
      }

      return { success: true, message: 'Appointment cancelled successfully' };
    }

    // Otherwise, cancel the most recent scheduled appointment for this contact
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select('id, scheduled_time')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !appointment) {
      console.log('[Tool: cancelAppointment] No scheduled appointment found');
      return { success: false, error: 'No scheduled appointment found to cancel' };
    }

    const { error: cancelError } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointment.id);

    if (cancelError) {
      console.error('[Tool: cancelAppointment] Error:', cancelError);
      return { success: false, error: 'Failed to cancel appointment' };
    }

    console.log(`[Tool: cancelAppointment] Cancelled appointment ${appointment.id}`);
    return { 
      success: true, 
      message: `Appointment for ${new Date(appointment.scheduled_time).toLocaleString()} has been cancelled` 
    };
  } catch (error) {
    console.error('[Tool: cancelAppointment] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
