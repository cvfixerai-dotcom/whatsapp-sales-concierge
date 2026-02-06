// @ts-nocheck
/**
 * Multi-Channel Handoff Service
 * Handles handoff notifications across Dashboard, Email, WhatsApp, and Telegram
 */

import { supabaseAdmin } from '../../db/client';
import { DashboardNotifier } from './channels/dashboard';
import { EmailNotifier } from './channels/email';
import { WhatsAppNotifier } from './channels/whatsapp';
import { TelegramNotifier } from './channels/telegram';

export interface HandoffTriggerParams {
  tenantId: string;
  conversationId: string;
  contactId: string;
  triggers: string[];
  aiSummary?: string;
  lastMessage?: string;
}

export interface HandoffEvent {
  id: string;
  tenant_id: string;
  conversation_id: string;
  contact_id: string;
  triggers: string[];
  ai_summary: string | null;
  last_customer_message: string | null;
  status: 'pending' | 'acknowledged' | 'resolved' | 'expired';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  notifications_sent: Record<string, string>;
  created_at: string;
  // Joined data
  contact_name?: string;
  contact_phone?: string;
  company_name?: string;
}

export interface HandoffSettings {
  channels: {
    dashboard: boolean;
    email: boolean;
    whatsapp: boolean;
    telegram: boolean;
  };
  recipients: {
    email: string | null;
    whatsapp: string | null;
    telegram_chat_id: string | null;
  };
  escalation: {
    enabled: boolean;
    timeout_minutes: number;
    escalation_channel: 'email' | 'whatsapp' | 'telegram';
  };
}

const DEFAULT_HANDOFF_SETTINGS: HandoffSettings = {
  channels: {
    dashboard: true,
    email: true,
    whatsapp: false,
    telegram: false,
  },
  recipients: {
    email: null,
    whatsapp: null,
    telegram_chat_id: null,
  },
  escalation: {
    enabled: false,
    timeout_minutes: 5,
    escalation_channel: 'email',
  },
};

export class HandoffService {
  private static instance: HandoffService;
  
  private dashboardNotifier: DashboardNotifier;
  private emailNotifier: EmailNotifier;
  private whatsappNotifier: WhatsAppNotifier;
  private telegramNotifier: TelegramNotifier;

  private constructor() {
    this.dashboardNotifier = new DashboardNotifier();
    this.emailNotifier = new EmailNotifier();
    this.whatsappNotifier = new WhatsAppNotifier();
    this.telegramNotifier = new TelegramNotifier();
  }

  static getInstance(): HandoffService {
    if (!HandoffService.instance) {
      HandoffService.instance = new HandoffService();
    }
    return HandoffService.instance;
  }

  /**
   * Trigger a handoff and notify all configured channels
   */
  async triggerHandoff(params: HandoffTriggerParams): Promise<HandoffEvent | null> {
    const { tenantId, conversationId, contactId, triggers, aiSummary, lastMessage } = params;
    
    console.log(`[HandoffService] Triggering handoff for conversation ${conversationId}`);
    console.log(`[HandoffService] Triggers: ${triggers.join(', ')}`);

    try {
      // 1. Get tenant settings and contact info
      const [tenantResult, contactResult] = await Promise.all([
        supabaseAdmin
          .from('tenants')
          .select('company_name, handoff_settings')
          .eq('id', tenantId)
          .single(),
        supabaseAdmin
          .from('contacts')
          .select('name, whatsapp_number, email')
          .eq('id', contactId)
          .single(),
      ]);

      if (tenantResult.error || !tenantResult.data) {
        console.error('[HandoffService] Tenant not found:', tenantId);
        return null;
      }

      if (contactResult.error || !contactResult.data) {
        console.error('[HandoffService] Contact not found:', contactId);
        return null;
      }

      const tenant = tenantResult.data;
      const contact = contactResult.data;
      const settings: HandoffSettings = tenant.handoff_settings || DEFAULT_HANDOFF_SETTINGS;

      // 2. Create handoff event record
      const { data: handoff, error: insertError } = await supabaseAdmin
        .from('handoff_events')
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: contactId,
          triggers,
          ai_summary: aiSummary || null,
          last_customer_message: lastMessage || null,
          status: 'pending',
          notifications_sent: {},
        })
        .select()
        .single();

      if (insertError || !handoff) {
        console.error('[HandoffService] Failed to create handoff event:', insertError);
        return null;
      }

      // Enrich handoff with contact/tenant info
      const enrichedHandoff: HandoffEvent = {
        ...handoff,
        contact_name: contact.name || 'Unknown Customer',
        contact_phone: contact.whatsapp_number,
        company_name: tenant.company_name,
      };

      // 3. Update conversation status
      await supabaseAdmin
        .from('conversations')
        .update({
          status: 'handoff-requested',
          handoff_reason: triggers.join(', '),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      // 4. Send notifications to all enabled channels IN PARALLEL
      const notificationPromises: Promise<{ channel: string; success: boolean; timestamp?: string }>[] = [];

      if (settings.channels.dashboard) {
        notificationPromises.push(
          this.dashboardNotifier.notify(enrichedHandoff, tenantId)
            .then(success => ({ channel: 'dashboard', success, timestamp: success ? new Date().toISOString() : undefined }))
        );
      }

      if (settings.channels.email && settings.recipients.email) {
        notificationPromises.push(
          this.emailNotifier.notify(enrichedHandoff, settings.recipients.email)
            .then(success => ({ channel: 'email', success, timestamp: success ? new Date().toISOString() : undefined }))
        );
      }

      if (settings.channels.whatsapp && settings.recipients.whatsapp) {
        notificationPromises.push(
          this.whatsappNotifier.notify(enrichedHandoff, settings.recipients.whatsapp, tenantId)
            .then(success => ({ channel: 'whatsapp', success, timestamp: success ? new Date().toISOString() : undefined }))
        );
      }

      if (settings.channels.telegram && settings.recipients.telegram_chat_id) {
        notificationPromises.push(
          this.telegramNotifier.notify(enrichedHandoff, settings.recipients.telegram_chat_id)
            .then(success => ({ channel: 'telegram', success, timestamp: success ? new Date().toISOString() : undefined }))
        );
      }

      // Wait for all notifications
      const results = await Promise.allSettled(notificationPromises);
      
      // Build notifications_sent object
      const notificationsSent: Record<string, string> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.timestamp) {
          notificationsSent[result.value.channel] = result.value.timestamp;
        }
      });

      // 5. Update handoff record with notification timestamps
      await supabaseAdmin
        .from('handoff_events')
        .update({ notifications_sent: notificationsSent })
        .eq('id', handoff.id);

      console.log(`[HandoffService] Handoff ${handoff.id} created, notifications sent:`, Object.keys(notificationsSent));

      return enrichedHandoff;
    } catch (error) {
      console.error('[HandoffService] Error triggering handoff:', error);
      return null;
    }
  }

  /**
   * Acknowledge a handoff (claim it)
   */
  async acknowledgeHandoff(handoffId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('handoff_events')
        .update({
          status: 'acknowledged',
          acknowledged_by: userId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', handoffId)
        .eq('status', 'pending'); // Only acknowledge if still pending

      if (error) {
        console.error('[HandoffService] Failed to acknowledge handoff:', error);
        return false;
      }

      console.log(`[HandoffService] Handoff ${handoffId} acknowledged by user ${userId}`);
      return true;
    } catch (error) {
      console.error('[HandoffService] Error acknowledging handoff:', error);
      return false;
    }
  }

  /**
   * Resolve a handoff (mark as complete)
   */
  async resolveHandoff(handoffId: string, conversationId: string): Promise<boolean> {
    try {
      // Update handoff status
      const { error: handoffError } = await supabaseAdmin
        .from('handoff_events')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      if (handoffError) {
        console.error('[HandoffService] Failed to resolve handoff:', handoffError);
        return false;
      }

      // Update conversation status back to active
      await supabaseAdmin
        .from('conversations')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      console.log(`[HandoffService] Handoff ${handoffId} resolved`);
      return true;
    } catch (error) {
      console.error('[HandoffService] Error resolving handoff:', error);
      return false;
    }
  }

  /**
   * Get pending handoffs for a tenant
   */
  async getPendingHandoffs(tenantId: string): Promise<HandoffEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('handoff_events')
        .select(`
          *,
          contacts(name, whatsapp_number),
          conversations(status)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[HandoffService] Failed to get pending handoffs:', error);
        return [];
      }

      return data.map(h => ({
        ...h,
        contact_name: h.contacts?.name || 'Unknown',
        contact_phone: h.contacts?.whatsapp_number,
      }));
    } catch (error) {
      console.error('[HandoffService] Error getting pending handoffs:', error);
      return [];
    }
  }

  /**
   * Get handoff settings for a tenant
   */
  async getHandoffSettings(tenantId: string): Promise<HandoffSettings> {
    try {
      const { data, error } = await supabaseAdmin
        .from('tenants')
        .select('handoff_settings')
        .eq('id', tenantId)
        .single();

      if (error || !data) {
        return DEFAULT_HANDOFF_SETTINGS;
      }

      return data.handoff_settings || DEFAULT_HANDOFF_SETTINGS;
    } catch (error) {
      console.error('[HandoffService] Error getting handoff settings:', error);
      return DEFAULT_HANDOFF_SETTINGS;
    }
  }

  /**
   * Update handoff settings for a tenant
   */
  async updateHandoffSettings(tenantId: string, settings: Partial<HandoffSettings>): Promise<boolean> {
    try {
      // Get current settings
      const currentSettings = await this.getHandoffSettings(tenantId);
      
      // Merge with new settings
      const updatedSettings: HandoffSettings = {
        channels: { ...currentSettings.channels, ...settings.channels },
        recipients: { ...currentSettings.recipients, ...settings.recipients },
        escalation: { ...currentSettings.escalation, ...settings.escalation },
      };

      const { error } = await supabaseAdmin
        .from('tenants')
        .update({
          handoff_settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      if (error) {
        console.error('[HandoffService] Failed to update handoff settings:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[HandoffService] Error updating handoff settings:', error);
      return false;
    }
  }
}

export const handoffService = HandoffService.getInstance();
