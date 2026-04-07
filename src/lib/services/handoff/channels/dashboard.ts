/**
 * Dashboard Notification Channel
 * Uses Supabase Realtime to push notifications to the dashboard
 */

import { supabaseAdmin } from '../../../db/client';
import { HandoffEvent } from '../index';

export class DashboardNotifier {
  /**
   * Send real-time notification to dashboard
   * The handoff_events insert already triggers realtime, but we also broadcast
   * to a specific channel for immediate push notifications
   */
  async notify(handoff: HandoffEvent, tenantId: string): Promise<boolean> {
    try {
      console.log(`[DashboardNotifier] Sending notification for handoff ${handoff.id}`);

      // Broadcast to tenant-specific channel
      // Frontend will subscribe to this channel for real-time updates
      const channel = supabaseAdmin.channel(`handoff:${tenantId}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'new_handoff',
        payload: {
          id: handoff.id,
          conversation_id: handoff.conversation_id,
          contact_id: handoff.contact_id,
          contact_name: handoff.contact_name,
          contact_phone: handoff.contact_phone,
          triggers: handoff.triggers,
          ai_summary: handoff.ai_summary,
          last_message: handoff.last_customer_message,
          created_at: handoff.created_at,
        },
      });

      console.log(`[DashboardNotifier] Broadcast sent to channel handoff:${tenantId}`);
      return true;
    } catch (error) {
      console.error('[DashboardNotifier] Error sending notification:', error);
      return false;
    }
  }
}
