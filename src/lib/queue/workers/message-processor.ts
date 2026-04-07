import { supabaseAdmin } from '../../db/client';
import { twilioService } from '../../services/twilio';
import { redisQueue, QueueMessage } from '../redis';
import { aiAgent } from '../../ai/agent';
import { v4 as uuidv4 } from 'uuid';

const CONVERSATION_WINDOW_HOURS = 24;

export class MessageProcessor {
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;

  /**
   * Start the message processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Message processor already running');
      return;
    }

    console.log('Starting message processor...');
    this.isRunning = true;

    // Process messages every 100ms
    this.processingInterval = setInterval(() => {
      this.processNextMessage();
    }, 100);

    // Clean up stale messages every minute
    setInterval(() => {
      redisQueue.cleanupStaleMessages();
    }, 60000);
  }

  /**
   * Stop the message processor
   */
  async stop(): Promise<void> {
    console.log('Stopping message processor...');
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Process the next message in the queue
   */
  private async processNextMessage(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const message = await redisQueue.dequeueMessage();
      if (!message) return;

      console.log(`Processing message: ${message.id} (type: ${message.type})`);

      // Process based on message type
      switch (message.type) {
        case 'inbound_message':
          await this.handleInboundMessage(message);
          break;
        case 'outbound_message':
          await this.handleOutboundMessage(message);
          break;
        case 'ai_response':
          await this.handleAIResponse(message);
          break;
        case 'appointment_reminder':
          await this.handleAppointmentReminder(message);
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }

      // Mark as processed
      await redisQueue.markMessageProcessed(message.id);
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Get the current message to handle failure
      // Note: In a real implementation, you'd track the current message
      // For now, we'll just log the error
    }
  }

  /**
   * Handle inbound WhatsApp message
   */
  private async handleInboundMessage(message: QueueMessage): Promise<void> {
    const { tenantId, payload } = message;
    const { From, To, Body, MessageSid, NumMedia } = payload;

    try {
      // Get or create contact
      const contact = await this.getOrCreateContact(tenantId, From, To);
      
      // Get or create conversation (24-hour window logic)
      const conversation = await this.getOrCreateConversation(tenantId, contact.id);
      
      // Save message to database
      await this.saveMessage({
        conversation_id: conversation.id,
        tenant_id: tenantId,
        direction: 'inbound',
        sender_type: 'contact',
        content: Body,
        twilio_message_sid: MessageSid,
        metadata: {
          numMedia: NumMedia,
          from: From,
          to: To,
        },
      });

      // Update contact's last message time
      await supabaseAdmin
        .from('contacts')
        .update({
          last_message_at: new Date().toISOString(),
          first_message_at: contact.first_message_at || new Date().toISOString(),
        })
        .eq('id', contact.id);

      // Mark webhook as processed
      await twilioService.markWebhookProcessed(tenantId, MessageSid);

      // Queue AI response
      await redisQueue.queueMessage({
        type: 'ai_response',
        tenantId,
        payload: {
          conversationId: conversation.id,
          contactId: contact.id,
          message: Body,
          from: From,
        },
        maxRetries: 3,
      });

      console.log(`Inbound message processed for conversation ${conversation.id}`);
    } catch (error) {
      console.error('Error handling inbound message:', error);
      await twilioService.markWebhookProcessed(
        tenantId,
        MessageSid,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Handle outbound WhatsApp message
   */
  private async handleOutboundMessage(message: QueueMessage): Promise<void> {
    const { tenantId, payload } = message;
    const { to, body, mediaUrl, conversationId } = payload;

    try {
      // Send message via Twilio
      const result = await twilioService.sendWhatsAppMessage(
        tenantId,
        to,
        body,
        { mediaUrl }
      );

      if (!result.success) {
        // Check if it was rate limited
        if (result.rateLimited) {
          // Don't mark as failed - the message was requeued
          console.log(`Message rate limited and requeued: ${to}`);
          return;
        }
        throw new Error(result.error);
      }

      // Save message to database if conversation ID is provided
      if (conversationId) {
        await this.saveMessage({
          conversation_id: conversationId,
          tenant_id: tenantId,
          direction: 'outbound',
          sender_type: 'ai',
          content: body,
          twilio_message_sid: result.messageSid,
          metadata: {
            mediaUrl,
          },
        });
      }

      console.log(`Outbound message sent to ${to}`);
    } catch (error) {
      console.error('Error sending outbound message:', error);
      throw error;
    }
  }

  /**
   * Handle AI response generation
   */
  private async handleAIResponse(message: QueueMessage): Promise<void> {
    const { tenantId, payload } = message;
    const { conversationId, contactId, message: userMessage, from } = payload;

    try {
      // Get contact language preference
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('language')
        .eq('id', contactId)
        .single();

      const language = contact?.language || 'en';

      // Process message with AI agent
      await aiAgent.processInboundMessage({
        tenantId,
        contactId,
        conversationId,
        messageContent: userMessage,
        language,
      });

      console.log(`AI response processed for conversation ${conversationId}`);
    } catch (error) {
      console.error('Error generating AI response:', error);
      
      // Send error message
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('whatsapp_number, language')
        .eq('id', contactId)
        .single();

      if (contact) {
        const errorMessage = contact.language === 'ar' 
          ? 'عذراً، أواجه بعض الصعوبة. سيعود إليك فريقنا قريباً.'
          : "I'm sorry, I'm having some trouble. Our team will get back to you shortly.";

        await redisQueue.queueOutboundMessage(
          tenantId,
          contact.whatsapp_number,
          errorMessage,
          { conversationId }
        );
      }
      
      throw error;
    }
  }

  /**
   * Handle appointment reminder
   */
  private async handleAppointmentReminder(message: QueueMessage): Promise<void> {
    const { tenantId, payload } = message;
    const { appointmentId, contactNumber } = payload;

    try {
      // Get appointment details
      const { data: appointment } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId)
        .single();

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Send reminder message
      const reminderMessage = `Reminder: You have an appointment scheduled for ${new Date(
        appointment.scheduled_time
      ).toLocaleString()}. Reply CANCEL to reschedule.`;

      await redisQueue.queueOutboundMessage(
        tenantId,
        contactNumber,
        reminderMessage,
        {
          conversationId: appointment.conversation_id,
        }
      );

      // Mark reminder as sent
      await supabaseAdmin
        .from('appointments')
        .update({
          reminder_sent: true,
          reminder_count: appointment.reminder_count + 1,
        })
        .eq('id', appointmentId);

      console.log(`Reminder sent for appointment ${appointmentId}`);
    } catch (error) {
      console.error('Error sending reminder:', error);
      throw error;
    }
  }

  /**
   * Get or create contact
   */
  private async getOrCreateContact(
    tenantId: string,
    from: string,
    to: string
  ): Promise<any> {
    // Clean phone numbers
    const cleanFrom = from.replace('whatsapp:', '');
    const cleanTo = to.replace('whatsapp:', '');

    // Try to get existing contact
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', cleanFrom)
      .single();

    if (contact) {
      return contact;
    }

    // Create new contact
    const { data: newContact, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        whatsapp_number: cleanFrom,
        temperature: 'new',
        lead_score: 0,
        qualification_status: 'unqualified',
        source: 'organic',
        metadata: {
          firstMessageTo: cleanTo,
        },
      })
      .select()
      .single();

    if (error) throw error;
    return newContact;
  }

  /**
   * Get or create conversation with 24-hour window logic
   */
  private async getOrCreateConversation(
    tenantId: string,
    contactId: string
  ): Promise<any> {
    // Check for active conversation within 24 hours
    const twentyFourHoursAgo = new Date(
      Date.now() - CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000
    );

    const { data: activeConversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .gte('conversation_window_start', twentyFourHoursAgo.toISOString())
      .single();

    if (activeConversation) {
      return activeConversation;
    }

    // Close any old conversations
    await supabaseAdmin
      .from('conversations')
      .update({
        is_active: false,
        status: 'closed',
        conversation_window_end: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('is_active', true);

    // Create new conversation (new billing unit)
    const { data: newConversation, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        conversation_window_start: new Date().toISOString(),
        is_active: true,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    // Track conversation usage for billing
    try {
      const billingMonth = new Date().toISOString().slice(0, 7) + '-01'; // YYYY-MM-01
      
      // Check if usage record exists
      const { data: existingUsage } = await supabaseAdmin
        .from('conversation_usage')
        .select('id, conversation_count')
        .eq('tenant_id', tenantId)
        .eq('billing_month', billingMonth)
        .single();

      if (existingUsage) {
        // Update existing record
        await supabaseAdmin
          .from('conversation_usage')
          .update({
            conversation_count: existingUsage.conversation_count + 1,
            last_updated: new Date().toISOString(),
          })
          .eq('id', existingUsage.id);
      } else {
        // Create new record
        await supabaseAdmin
          .from('conversation_usage')
          .insert({
            tenant_id: tenantId,
            billing_month: billingMonth,
            conversation_count: 1,
            topup_conversations_remaining: 0,
          });
      }
    } catch (billingError) {
      // Don't fail the conversation if billing tracking fails
      console.error('Error tracking conversation usage:', billingError);
    }

    return newConversation;
  }

  /**
   * Save message to database
   */
  private async saveMessage(messageData: any): Promise<void> {
    const { error } = await supabaseAdmin
      .from('messages')
      .insert(messageData);

    if (error) throw error;
  }
}

// Export singleton instance
export const messageProcessor = new MessageProcessor();
