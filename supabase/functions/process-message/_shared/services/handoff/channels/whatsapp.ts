import { Buffer } from 'node:buffer';
/**
 * WhatsApp Notification Channel
 * Uses Twilio to send handoff notifications to business owner's WhatsApp
 */

import { HandoffEvent } from '../index.ts';
import { supabaseAdmin } from '../../../db/client.ts';

export class WhatsAppNotifier {
  /**
   * Send handoff notification via WhatsApp to business owner
   */
  async notify(handoff: HandoffEvent, recipientPhone: string, tenantId: string): Promise<boolean> {
    try {
      console.log(`[WhatsAppNotifier] Sending notification to ${recipientPhone}`);

      // Get tenant's Twilio credentials
      const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_number')
        .eq('id', tenantId)
        .single();

      if (error || !tenant) {
        console.error('[WhatsAppNotifier] Tenant not found:', tenantId);
        return false;
      }

      if (!tenant.twilio_account_sid || !tenant.twilio_auth_token || !tenant.twilio_whatsapp_number) {
        console.error('[WhatsAppNotifier] Twilio not configured for tenant');
        return false;
      }

      // Format the notification message
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const dashboardLink = `${appUrl}/dashboard/conversations/${handoff.conversation_id}`;

      const message = `🚨 *HANDOFF REQUIRED*

*Customer:* ${handoff.contact_name || 'Unknown'}
*Phone:* ${handoff.contact_phone || 'N/A'}

*Reason:* ${handoff.triggers.join(', ')}

*Last Message:*
"${handoff.last_customer_message || 'N/A'}"

*AI Summary:*
${handoff.ai_summary || 'Customer needs human assistance.'}

📱 View conversation: ${dashboardLink}

Reply "CLAIM ${handoff.id.slice(0, 8)}" to take over.`;

      // Ensure proper WhatsApp format for both numbers
      const toNumber = recipientPhone.startsWith('whatsapp:') 
        ? recipientPhone 
        : `whatsapp:${recipientPhone.startsWith('+') ? recipientPhone : '+' + recipientPhone}`;
      
      const fromNumber = tenant.twilio_whatsapp_number.startsWith('whatsapp:')
        ? tenant.twilio_whatsapp_number
        : `whatsapp:${tenant.twilio_whatsapp_number}`;

      // Send via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${tenant.twilio_account_sid}/Messages.json`;
      
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${tenant.twilio_account_sid}:${tenant.twilio_auth_token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toNumber,
          From: fromNumber,
          Body: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WhatsAppNotifier] Twilio error:', errorText);
        return false;
      }

      const result = await response.json();
      console.log(`[WhatsAppNotifier] Message sent, SID: ${result.sid}`);
      return true;
    } catch (error) {
      console.error('[WhatsAppNotifier] Error sending WhatsApp:', error);
      return false;
    }
  }
}
