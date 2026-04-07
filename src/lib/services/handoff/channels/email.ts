/**
 * Email Notification Channel
 * Uses Resend to send handoff notification emails
 */

import { HandoffEvent } from '../index';
import { sendEmail } from '../../../ai/tools/send-email';

export class EmailNotifier {
  /**
   * Send handoff notification via email
   */
  async notify(handoff: HandoffEvent, recipientEmail: string): Promise<boolean> {
    try {
      console.log(`[EmailNotifier] Sending notification to ${recipientEmail}`);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const dashboardLink = `${appUrl}/dashboard/conversations/${handoff.conversation_id}`;

      const result = await sendEmail({
        to: recipientEmail,
        template: 'handoff_request',
        data: {
          customer_name: handoff.contact_name || 'Unknown Customer',
          customer_phone: handoff.contact_phone || 'N/A',
          conversation_id: handoff.conversation_id,
          triggers: handoff.triggers.join(', '),
          last_message: handoff.last_customer_message || 'N/A',
          ai_summary: handoff.ai_summary || 'Customer requires human assistance.',
          dashboard_link: dashboardLink,
          company_name: handoff.company_name || 'WhatsApp Sales Concierge',
        },
      });

      if (result.success) {
        console.log(`[EmailNotifier] Email sent successfully to ${recipientEmail}`);
        return true;
      } else {
        console.error(`[EmailNotifier] Failed to send email:`, result.error);
        return false;
      }
    } catch (error) {
      console.error('[EmailNotifier] Error sending email:', error);
      return false;
    }
  }
}
