// @ts-nocheck
import { supabaseAdmin } from '../db/client';
import { sendEmail } from '../ai/tools/send-email';
import { twilioService } from '../services/twilio';
import { handoffService } from '../services/handoff';

interface HandoffNotificationData {
  conversationId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  triggers: string[];
}

interface Agent {
  id: string;
  email: string;
  name: string;
  role: string;
  phone_number?: string;
  notification_preferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
    handoff: boolean;
  };
}

export async function notifyHandoffRequest(
  conversationId: string,
  reason: string,
  severity: 'low' | 'medium' | 'high' = 'medium',
  triggers: string[] = []
): Promise<{ success: boolean; notifiedAgents: number }> {
  try {
    // Get conversation details
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        contacts(id, name, whatsapp_number),
        tenants(company_name)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return { success: false, notifiedAgents: 0 };
    }

    // Update conversation status
    await supabaseAdmin
      .from('conversations')
      .update({
        status: 'handoff-requested',
        handoff_reason: reason,
        handoff_requested_at: new Date().toISOString(),
        handoff_triggers: triggers
      })
      .eq('id', conversationId);

    // Get last message for context
    const { data: lastMessage } = await supabaseAdmin
      .from('messages')
      .select('content')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Use the new multi-channel HandoffService for tenant-configured notifications
    const handoffEvent = await handoffService.triggerHandoff({
      tenantId: conversation.tenant_id,
      conversationId,
      contactId: conversation.contacts?.id || conversation.contact_id,
      triggers,
      aiSummary: reason,
      lastMessage: lastMessage?.content || '',
    });

    if (handoffEvent) {
      console.log(`[Handoff] Multi-channel notifications sent for handoff ${handoffEvent.id}`);
    }

    // Get available agents
    const { data: agents, error: agentError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('tenant_id', conversation.tenant_id)
      .in('role', ['owner', 'admin', 'agent'])
      .eq('is_active', true);

    if (agentError) {
      console.error('Error fetching agents:', agentError);
      return { success: false, notifiedAgents: 0 };
    }

    // Filter agents who want handoff notifications
    const eligibleAgents = agents?.filter(agent => 
      agent.notification_preferences?.handoff !== false
    ) || [];

    let notifiedCount = 0;

    // Send notifications to each agent
    for (const agent of eligibleAgents) {
      const prefs = agent.notification_preferences || {
        email: true,
        sms: false,
        push: true,
        handoff: true
      };

      // Email notification
      if (prefs.email) {
        await sendHandoffEmail(agent, conversation, reason, severity);
        notifiedCount++;
      }

      // SMS notification for high severity
      if (prefs.sms && (severity === 'high' || reason.includes('high_value'))) {
        await sendHandoffSMS(agent, conversation);
      }

      // In-app notification (real-time)
      if (prefs.push) {
        await createInAppNotification(agent.id, {
          type: 'handoff_request',
          title: 'Handoff Request',
          message: `${conversation.contacts?.name} needs assistance`,
          data: { conversationId, severity },
          priority: severity === 'high' ? 'high' : 'normal'
        });
      }
    }

    // Create notification log
    await supabaseAdmin
      .from('notification_logs')
      .insert({
        tenant_id: conversation.tenant_id,
        conversation_id: conversationId,
        type: 'handoff_request',
        recipient_count: notifiedCount,
        severity,
        reason,
        created_at: new Date().toISOString()
      });

    console.log(`Handoff notification sent to ${notifiedCount} agents`);
    
    return { success: true, notifiedAgents: notifiedCount };
  } catch (error) {
    console.error('Error sending handoff notification:', error);
    return { success: false, notifiedAgents: 0 };
  }
}

async function sendHandoffEmail(
  agent: Agent,
  conversation: any,
  reason: string,
  severity: 'low' | 'medium' | 'high'
): Promise<void> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    await sendEmail({
      to: agent.email,
      template: 'handoff_request',
      data: {
        agent_name: agent.name,
        contact_name: conversation.contacts?.name || 'Unknown',
        contact_phone: conversation.contacts?.whatsapp_number,
        company_name: conversation.tenants?.company_name,
        reason,
        severity,
        conversation_url: `${appUrl}/dashboard/conversations/${conversation.id}`,
        urgent: severity === 'high'
      }
    });
  } catch (error) {
    console.error('Error sending handoff email:', error);
  }
}

async function sendHandoffSMS(
  agent: Agent,
  conversation: any
): Promise<void> {
  try {
    if (!agent.phone_number) return;

    const message = `🚨 SalesConcierge: High-priority handoff request. ${conversation.contacts?.name} needs immediate assistance. View: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/conversations/${conversation.id}`;
    
    await twilioService.sendSMS(
      conversation.tenant_id,
      agent.phone_number,
      message
    );
  } catch (error) {
    console.error('Error sending handoff SMS:', error);
  }
}

async function createInAppNotification(
  agentId: string,
  notification: {
    type: string;
    title: string;
    message: string;
    data: any;
    priority: 'low' | 'normal' | 'high';
  }
): Promise<void> {
  try {
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: agentId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
        read: false,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error creating in-app notification:', error);
  }
}

// Escalate to manager if no agent responds within timeout
export async function escalateHandoff(
  conversationId: string,
  timeoutMinutes: number = 10
): Promise<void> {
  try {
    // Check if handoff is still pending
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*, tenants(*)')
      .eq('id', conversationId)
      .eq('status', 'handoff-requested')
      .single();

    if (!conversation) return;

    // Check if timeout has passed
    const handoffTime = new Date(conversation.handoff_requested_at);
    const now = new Date();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    if (now.getTime() - handoffTime.getTime() < timeoutMs) return;

    // Get managers/owners
    const { data: managers } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('tenant_id', conversation.tenant_id)
      .in('role', ['owner', 'admin']);

    if (!managers || managers.length === 0) return;

    // Send escalation notifications
    for (const manager of managers) {
      await sendEscalationEmail(manager, conversation);
      
      if (manager.phone_number) {
        await sendEscalationSMS(manager, conversation);
      }
    }

    // Update conversation with escalation flag
    await supabaseAdmin
      .from('conversations')
      .update({
        handoff_escalated: true,
        handoff_escalated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    console.log(`Handoff escalated for conversation ${conversationId}`);
  } catch (error) {
    console.error('Error escalating handoff:', error);
  }
}

async function sendEscalationEmail(
  manager: Agent,
  conversation: any
): Promise<void> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    await sendEmail({
      to: manager.email,
      template: 'handoff_escalation',
      data: {
        manager_name: manager.name,
        contact_name: conversation.contacts?.name || 'Unknown',
        company_name: conversation.tenants?.company_name,
        wait_time: '10 minutes',
        conversation_url: `${appUrl}/dashboard/conversations/${conversation.id}`
      }
    });
  } catch (error) {
    console.error('Error sending escalation email:', error);
  }
}

async function sendEscalationSMS(
  manager: Agent,
  conversation: any
): Promise<void> {
  try {
    if (!manager.phone_number) return;

    const message = `⚠️ ESCALATION: Handoff request unattended for 10 minutes. ${conversation.contacts?.name} is waiting. Immediate action required.`;
    
    await twilioService.sendSMS(
      conversation.tenant_id,
      manager.phone_number,
      message
    );
  } catch (error) {
    console.error('Error sending escalation SMS:', error);
  }
}

// Claim a handoff request
export async function claimHandoff(
  conversationId: string,
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update conversation
    const { error } = await supabaseAdmin
      .from('conversations')
      .update({
        status: 'human-handled',
        assigned_agent_id: agentId,
        handoff_claimed_at: new Date().toISOString(),
        handoff_claimed_by: agentId
      })
      .eq('id', conversationId)
      .eq('status', 'handoff-requested');

    if (error) {
      return { success: false, error: error.message };
    }

    // Clear any pending notifications for this conversation
    await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('data->>conversationId', conversationId)
      .eq('type', 'handoff_request');

    // Log the claim
    await supabaseAdmin
      .from('handoff_logs')
      .insert({
        conversation_id: conversationId,
        trigger_type: 'claim',
        severity: 'info',
        message: `Handoff claimed by agent ${agentId}`,
        agent_id: agentId,
        created_at: new Date().toISOString()
      });

    return { success: true };
  } catch (error) {
    console.error('Error claiming handoff:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Resolve a handoff
export async function resolveHandoff(
  conversationId: string,
  resolution: 'resolved' | 'returned_to_ai',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: any = {
      handoff_resolved_at: new Date().toISOString(),
      handoff_resolution: resolution,
      handoff_notes: notes
    };

    if (resolution === 'returned_to_ai') {
      updates.status = 'active';
      updates.assigned_agent_id = null;
    } else {
      updates.status = 'resolved';
    }

    const { error } = await supabaseAdmin
      .from('conversations')
      .update(updates)
      .eq('id', conversationId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log the resolution
    await supabaseAdmin
      .from('handoff_logs')
      .insert({
        conversation_id: conversationId,
        trigger_type: 'resolution',
        severity: 'info',
        message: `Handoff resolved: ${resolution}${notes ? ` - ${notes}` : ''}`,
        created_at: new Date().toISOString()
      });

    return { success: true };
  } catch (error) {
    console.error('Error resolving handoff:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
