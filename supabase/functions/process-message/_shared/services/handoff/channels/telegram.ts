/**
 * Telegram Notification Channel
 * Uses Telegram Bot API to send handoff notifications
 */

import { HandoffEvent } from '../index.ts';

export class TelegramNotifier {
  private botToken: string | undefined;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
  }

  /**
   * Send handoff notification via Telegram
   */
  async notify(handoff: HandoffEvent, chatId: string): Promise<boolean> {
    try {
      if (!this.botToken) {
        console.error('[TelegramNotifier] TELEGRAM_BOT_TOKEN not configured');
        return false;
      }

      console.log(`[TelegramNotifier] Sending notification to chat ${chatId}`);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const dashboardLink = `${appUrl}/dashboard/conversations/${handoff.conversation_id}`;

      // Format message with Markdown
      const message = `🚨 *HANDOFF REQUIRED*

*Customer:* ${this.escapeMarkdown(handoff.contact_name || 'Unknown')}
*Phone:* ${this.escapeMarkdown(handoff.contact_phone || 'N/A')}

*Reason:* ${this.escapeMarkdown(handoff.triggers.join(', '))}

*Last Message:*
_"${this.escapeMarkdown(handoff.last_customer_message || 'N/A')}"_

*AI Summary:*
${this.escapeMarkdown(handoff.ai_summary || 'Customer needs human assistance.')}

[📱 View in Dashboard](${dashboardLink})`;

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Claim Handoff',
                    callback_data: `claim_${handoff.id}`,
                  },
                  {
                    text: '👁 View Conversation',
                    url: dashboardLink,
                  },
                ],
              ],
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[TelegramNotifier] Telegram API error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log(`[TelegramNotifier] Message sent, message_id: ${result.result?.message_id}`);
      return true;
    } catch (error) {
      console.error('[TelegramNotifier] Error sending Telegram message:', error);
      return false;
    }
  }

  /**
   * Escape special characters for Telegram Markdown
   */
  private escapeMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/`/g, '\\`');
  }

  /**
   * Get bot info (useful for setup verification)
   */
  async getBotInfo(): Promise<{ ok: boolean; username?: string; error?: string }> {
    try {
      if (!this.botToken) {
        return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
      }

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getMe`
      );

      if (!response.ok) {
        return { ok: false, error: 'Invalid bot token' };
      }

      const data = await response.json();
      return { ok: true, username: data.result?.username };
    } catch (error) {
      return { ok: false, error: 'Failed to connect to Telegram' };
    }
  }
}
