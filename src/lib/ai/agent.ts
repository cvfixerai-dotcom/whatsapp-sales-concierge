import { supabaseAdmin } from '../db/client';
import { twilioService } from '../services/twilio';
import { redisQueue } from '../queue/redis';
import { getAIProvider } from './providers';
import { buildSystemPrompt, getQualificationCriteria, calculateLeadScore } from './prompts';
import { buildSimplifiedPrompt } from './prompt-simple';
import { determineConversationState, ConversationState } from './state-manager';
import { executeTool } from './tools';
import { formatBookingConfirmation } from './booking-confirmation';
import { checkHandoffTriggers, logHandoffTrigger } from '../handoff/detector';
import { notifyHandoffRequest } from '../handoff/notifier';
import * as Sentry from '@sentry/nextjs';

export interface ProcessMessageParams {
  tenantId: string;
  contactId: string;
  conversationId: string;
  messageContent: string;
  language: string;
}

export interface AIResponse {
  message: string;
  content: string;
  confidence: number;
  intent: string;
  sentiment?: string;
  qualificationData?: {
    interestLevel: number;
    timeline?: string;
    budget?: string;
    serviceInterest?: string;
    nextAction?: string;
  };
  toolCalls?: ToolCall[];
  handoffTriggered?: boolean;
  handoffReason?: string;
}

export interface ToolCall {
  id?: string;
  name: string;
  parameters: Record<string, any>;
  result?: any;
}

export interface HandoffDetection {
  needed: boolean;
  reason?: 'low_confidence' | 'high_value_lead' | 'keyword_trigger' | 'escalation' | 'complex_query';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ConversationContext {
  tenant: any;
  contact: any;
  conversation: any;
  messages: any[];
}

export class AIAgent {
  private static instance: AIAgent;

  private constructor() {}

  static getInstance(): AIAgent {
    if (!AIAgent.instance) {
      AIAgent.instance = new AIAgent();
    }
    return AIAgent.instance;
  }

  /**
   * Process inbound message and generate AI response
   */
  async processInboundMessage(params: ProcessMessageParams): Promise<void> {
    const startTime = Date.now();
    let aiResponse: AIResponse | null = null;
    let handoffDetected: HandoffDetection | null = null;
    let context: ConversationContext | null = null;

    try {
      console.log(`[AI Agent] Processing message for conversation ${params.conversationId}`);

      // 1. Load context
      context = await this.loadContext(
        params.tenantId,
        params.contactId,
        params.conversationId
      );

      // 2. Build AI prompt with state management
      const { prompt: systemPrompt, hasRecentBooking, state } = await this.buildSystemPrompt(
        context.tenant,
        context.contact,
        params.language,
        context.messages
      );
      const conversationHistory = this.formatHistory(context.messages);

      // 🔥 CRIT-2 FIX: In post-booking state, remove calendar/booking tools
      // This makes it physically impossible for the AI to re-offer slots
      let tools = this.getAvailableTools(context.tenant);
      if (hasRecentBooking || state === 'post_booking' || state === 'email_collected') {
        const blockedTools = ['check_calendar', 'book_appointment', 'cancel_appointment'];
        tools = tools.filter((t: any) => {
          const toolName = t.name || t.function?.name;
          return !blockedTools.includes(toolName);
        });
        console.log('[AI Agent] 🔒 POST-BOOKING: Removed calendar/booking tools. Remaining:', tools.map((t: any) => t.name || t.function?.name).join(', '));
      }

      // Track tool calls for state management
      const executedToolCalls: any[] = [];

      // 3. Call AI with tools
      aiResponse = await this.callAI({
        provider: context.tenant.ai_provider,
        model: context.tenant.ai_model,
        systemPrompt,
        messages: conversationHistory,
        newMessage: params.messageContent,
        tools,
        language: params.language,
        tenant: context.tenant,
        contact: context.contact,
      });

      // 4. Process tool calls — execute tools, then either send a deterministic confirmation
      //    (for book_appointment) or make a follow-up AI call for all other tools.
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        console.log(`[AI Agent] Executing ${aiResponse.toolCalls.length} tool(s): ${aiResponse.toolCalls.map(t => t.name).join(', ')}`);
        
        // 🔥 FIX: Save the assistant's message with tool calls to the database
        await this.saveMessage({
          conversation_id: params.conversationId,
          tenant_id: params.tenantId,
          direction: 'outbound',
          sender_type: 'ai',
          content: aiResponse.message || '',
          ai_confidence: aiResponse.confidence,
          metadata: {
            tool_calls: aiResponse.toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              parameters: tc.parameters,
            })),
          },
        });
        
        await this.executeTools(aiResponse.toolCalls, context);
        
        // 🔥 FIX: Save tool results to the database
        for (const toolCall of aiResponse.toolCalls) {
          await this.saveMessage({
            conversation_id: params.conversationId,
            tenant_id: params.tenantId,
            direction: 'outbound',
            sender_type: 'system',
            content: `Tool: ${toolCall.name} - ${toolCall.result?.success ? 'Success' : 'Failed'}`,
            metadata: {
              tool_call_id: toolCall.id,
              tool_name: toolCall.name,
              tool_result: toolCall.result,
            },
          });
        }
        
        // 🔥 OPTIMIZED: Only reload contact data if update_lead was called
        // Other tools (check_calendar, book_appointment) don't modify contact data
        const needsReload = aiResponse.toolCalls.some(tc => tc.name === 'update_lead');
        
        if (needsReload) {
          console.log('[AI Agent] 🔄 Reloading contact data after update_lead...');
          const { data: freshContact } = await supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('id', params.contactId)
            .single();
          
          if (freshContact) {
            context.contact = freshContact;
            console.log('[AI Agent] ✅ Contact data reloaded:', {
              name: freshContact.name,
              email: freshContact.email,
              budget_range: freshContact.budget_range,
              service_interest: freshContact.service_interest,
              timeline: freshContact.timeline,
              temperature: freshContact.temperature,
            });
          }
        } else {
          console.log('[AI Agent] ⏭️ Skipping contact reload (no update_lead call)');
        }

        // Check if a booking succeeded — if so, generate confirmation in code, never via AI
        const bookingCall = aiResponse.toolCalls.find(
          tc => tc.name === 'book_appointment' && tc.result?.success === true
        );

        if (bookingCall) {
          const confirmedIso: string = bookingCall.result.confirmed_iso;
          const tenantTimezone: string =
            context.tenant.timezone ||
            context.tenant.business_hours?.timezone ||
            'Asia/Dubai';
          const language: string = context.contact.language || params.language || 'en';

          console.log(`[AI Agent] Booking confirmed. Generating deterministic confirmation for ISO=${confirmedIso} tz=${tenantTimezone}`);

          aiResponse.message = formatBookingConfirmation(confirmedIso, tenantTimezone, language);
          // Skip AI follow-up entirely for successful bookings
        } else {
          // 🔥 CRITICAL FIX: Build updated conversation history with tool calls and results
          // This is the standard OpenAI function calling flow that was missing
          const updatedHistory = [
            ...conversationHistory,
            // Add the user's message that triggered the tool calls
            { role: 'user', content: params.messageContent },
            // Add the assistant's response with tool calls
            {
              role: 'assistant',
              content: aiResponse.message || '',
              tool_calls: aiResponse.toolCalls.map((tc, idx) => ({
                id: tc.id || `call_${idx}`,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.parameters),
                },
              })),
            },
            // Add tool results as tool messages
            ...aiResponse.toolCalls.map((tc, idx) => ({
              role: 'tool',
              tool_call_id: tc.id || `call_${idx}`,
              content: JSON.stringify(tc.result),
            })),
          ];

          console.log(`[AI Agent] Updated history length: ${updatedHistory.length} (was ${conversationHistory.length})`);
          console.log(`[AI Agent] Tool results:`, aiResponse.toolCalls.map(tc => `${tc.name}: ${tc.result?.success ? 'success' : 'failed'}`).join(', '));
          
          // 🔥 FIX: Rebuild system prompt with FRESH contact data
          const { prompt: freshSystemPrompt } = await this.buildSystemPrompt(
            context.tenant,
            context.contact, // Now has fresh data from reload above
            params.language,
            context.messages
          );
          console.log('[AI Agent] 🔄 REBUILT SYSTEM PROMPT with fresh contact data');

          // Build instruction for the follow-up call
          const toolResultsSummary = aiResponse.toolCalls.map(tc => {
            if (tc.name === 'check_calendar') {
              if (tc.result?.success && tc.result?.available_slots?.length > 0) {
                return `Calendar check: ${tc.result.available_slots.length} available slots — display these formatted times to the customer and ask which they prefer: ${tc.result.available_slots.slice(0, 5).map((s: any) => s.formatted).join(', ')}. When the customer picks one, call book_appointment with the exact datetime ISO string.`;
              }
              return `Calendar check: ${tc.result?.error || 'No available slots found'}`;
            }
            if (tc.name === 'book_appointment') {
              return `Booking failed: ${tc.result?.error || 'unknown error'}. Inform the customer and offer to check availability again.`;
            }
            if (tc.name === 'update_lead') {
              return `Lead updated${tc.result?.newScore ? ` (score: ${tc.result.newScore})` : ''}`;
            }
            if (tc.name === 'send_email') {
              return tc.result?.success ? 'Email sent successfully' : `Email failed: ${tc.result?.error}`;
            }
            return `${tc.name}: ${JSON.stringify(tc.result)}`;
          }).join('\n');

          const enrichedPrompt =
            freshSystemPrompt +
            `\n\nTOOL RESULTS (you just executed these tools — use the results in your next response):\n${toolResultsSummary}\n\nIMPORTANT: Respond to the customer based on the tool results above. Be natural and conversational. Keep it to 1-2 sentences. NEVER say "I'm processing" or "please wait". NEVER confirm a booking yourself — only the system can confirm bookings.`;

          // 🔥 CRITICAL FIX: Pass updated history WITHOUT re-adding the user message
          // The user message is already in updatedHistory, so we pass empty string
          // 🔥 CRIT-2 FIX: Use the same filtered `tools` variable (calendar/booking removed if post-booking)
          
          // DEBUG: Log the exact messages being sent
          console.log('[Debug] Follow-up messages:', JSON.stringify(updatedHistory, null, 2));
          
          // 🔥 CRITICAL FIX: Add explicit user message asking Claude to respond
          // Claude needs a user message at the end to know it should respond
          const followUpMessages = [
            ...updatedHistory,
            { role: 'user', content: 'Based on the tool results above, respond to the customer naturally and continue the conversation.' }
          ];
          
          const followUpResponse = await this.callAI({
            provider: context.tenant.ai_provider,
            model: context.tenant.ai_model,
            systemPrompt: enrichedPrompt,
            messages: followUpMessages,
            newMessage: '', // Messages already include the prompt above
            tools, // ✅ Uses filtered tools from CRIT-2 fix above
            language: params.language,
            tenant: context.tenant,
            contact: context.contact, // Fresh contact data
          });

          console.log(`[AI Agent] Follow-up response: ${followUpResponse.message.substring(0, 100)}`);
          
          // 🔥 HANDLE RECURSIVE TOOL CALLS
          // If the follow-up response also contains tool calls (e.g., check_calendar after update_lead),
          // execute those tools and make another follow-up call
          if (followUpResponse.toolCalls && followUpResponse.toolCalls.length > 0) {
            console.log(`[AI Agent] Follow-up response contains ${followUpResponse.toolCalls.length} more tool calls: ${followUpResponse.toolCalls.map(t => t.name).join(', ')}`);
            
            // Execute the additional tools
            await this.executeTools(followUpResponse.toolCalls, context);
            
            // Build another updated history with the new tool results
            const secondUpdatedHistory = [
              ...updatedHistory,
              {
                role: 'assistant',
                content: followUpResponse.message || '',
                tool_calls: followUpResponse.toolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.parameters),
                  },
                })),
              },
              ...followUpResponse.toolCalls.map((tc, idx) => ({
                role: 'tool',
                tool_call_id: tc.id || `call_${idx}`,
                content: JSON.stringify(tc.result),
              })),
            ];
            
            // Build instruction for the second follow-up
            const secondToolResultsSummary = followUpResponse.toolCalls.map(tc => {
              if (tc.name === 'check_calendar') {
                if (tc.result?.success && tc.result?.available_slots?.length > 0) {
                  return `Calendar check: ${tc.result.available_slots.length} available slots — display these formatted times to the customer and ask which they prefer: ${tc.result.available_slots.slice(0, 5).map((s: any) => s.formatted).join(', ')}. When the customer picks one, call book_appointment with the exact datetime ISO string.`;
                }
                return `Calendar check: ${tc.result?.error || 'No available slots found'}`;
              }
              return `${tc.name}: ${JSON.stringify(tc.result)}`;
            }).join('\n');
            
            const secondEnrichedPrompt = enrichedPrompt + `\n\nADDITIONAL TOOL RESULTS:\n${secondToolResultsSummary}`;
            
            // 🔥 CRITICAL FIX: Add explicit user message for second follow-up too
            const secondFollowUpMessages = [
              ...secondUpdatedHistory,
              { role: 'user', content: 'Based on the additional tool results above, respond to the customer naturally and continue the conversation.' }
            ];
            
            // Make a second follow-up call - use filtered tools (CRIT-2 fix)
            const secondFollowUpResponse = await this.callAI({
              provider: context.tenant.ai_provider,
              model: context.tenant.ai_model,
              systemPrompt: secondEnrichedPrompt,
              messages: secondFollowUpMessages,
              newMessage: '', // Messages already include the prompt above
              tools, // ✅ CRIT-2 FIX: Uses filtered tools (calendar/booking removed if post-booking)
              language: params.language,
              tenant: context.tenant,
              contact: context.contact,
            });
            
            console.log(`[AI Agent] Second follow-up response: ${secondFollowUpResponse.message.substring(0, 100)}`);
            
            // Handle tool calls from second follow-up (e.g., book_appointment after check_calendar)
            if (secondFollowUpResponse.toolCalls && secondFollowUpResponse.toolCalls.length > 0) {
              console.log(`[AI Agent] Second follow-up has ${secondFollowUpResponse.toolCalls.length} tool calls: ${secondFollowUpResponse.toolCalls.map(t => t.name).join(', ')}`);
              await this.executeTools(secondFollowUpResponse.toolCalls, context);
              
              // Check if booking succeeded
              const bookingCall = secondFollowUpResponse.toolCalls.find(
                tc => tc.name === 'book_appointment' && tc.result?.success === true
              );
              
              if (bookingCall) {
                const confirmedIso = bookingCall.result.confirmed_iso;
                const tenantTimezone = context.tenant.timezone || 'Asia/Dubai';
                const language = context.contact.language || params.language || 'en';
                console.log(`[AI Agent] Booking confirmed in second follow-up. ISO=${confirmedIso}`);
                aiResponse.message = formatBookingConfirmation(confirmedIso, tenantTimezone, language);
              } else {
                aiResponse.message = secondFollowUpResponse.message;
              }
            } else {
              aiResponse.message = secondFollowUpResponse.message;
            }
          } else {
            aiResponse.message = followUpResponse.message;
          }
        }
      }

      // 5. Check for handoff triggers
      const handoffResult = await checkHandoffTriggers(
        { content: params.messageContent, conversation_id: params.conversationId } as any,
        context.contact,
        aiResponse
      );

      if (handoffResult.needed) {
        console.log(`[AI Agent] Handoff triggered: ${handoffResult.triggers.map(t => t.type).join(', ')}`);
        
        // Log triggers
        for (const trigger of handoffResult.triggers) {
          await logHandoffTrigger(params.conversationId, trigger, aiResponse);
        }

        // 🔥 HANDOFF FIX: Mark contact as needing human attention
        // Ensures dashboards, follow-up schedulers, and reports see the escalation
        try {
          await supabaseAdmin
            .from('contacts')
            .update({ needs_human: true, updated_at: new Date().toISOString() })
            .eq('id', params.contactId);
          console.log('[AI Agent] ✅ Contact flagged as needs_human');
        } catch (flagErr) {
          console.error('[AI Agent] Failed to set needs_human on contact:', flagErr);
        }

        // Send handoff notification (also sets conversation.status = 'handoff-requested')
        const severity = handoffResult.triggers.some(t => t.severity === 'high') ? 'high' : 'medium';
        await notifyHandoffRequest(
          params.conversationId,
          handoffResult.triggers.map(t => t.message).join('; '),
          severity,
          handoffResult.triggers.map(t => t.type)
        );

        // Update AI response to indicate handoff
        aiResponse.handoffTriggered = true;
        aiResponse.handoffReason = handoffResult.triggers.map(t => t.message).join('; ');
      }

      // 5b. Safety net — never send empty or placeholder messages
      if (!aiResponse.message || aiResponse.message.trim().length < 3) {
        console.warn('[AI Agent] Empty AI response, using fallback');
        aiResponse.message = this.generateFallbackResponse(params.messageContent, params.language);
      }

      // 6. Save AI response (only if we didn't already save it during tool processing)
      if (!aiResponse.toolCalls || aiResponse.toolCalls.length === 0) {
        await this.saveMessage({
          conversation_id: params.conversationId,
          tenant_id: params.tenantId,
          direction: 'outbound',
          sender_type: 'ai',
          content: aiResponse.message,
          ai_confidence: aiResponse.confidence,
          ai_intent: aiResponse.intent,
          ai_sentiment: aiResponse.sentiment,
        });
      } else {
        // Update the last AI message with the final response
        // (The tool call message was already saved, now save the follow-up response)
        await this.saveMessage({
          conversation_id: params.conversationId,
          tenant_id: params.tenantId,
          direction: 'outbound',
          sender_type: 'ai',
          content: aiResponse.message,
          ai_confidence: aiResponse.confidence,
          ai_intent: aiResponse.intent,
          ai_sentiment: aiResponse.sentiment,
        });
      }

      // 7. Send WhatsApp reply
      await twilioService.sendWhatsAppMessage(
        params.tenantId,
        context.contact.whatsapp_number,
        aiResponse.message
      );

      // 8. Update contact scoring and qualification
      await this.updateLeadScore(params.contactId, aiResponse.qualificationData);
      await this.updateContactTemperature(
        params.contactId,
        aiResponse.qualificationData
      );

      // 9. Update conversation insights
      await this.updateConversationInsights(
        params.conversationId,
        aiResponse
      );

      const processingTime = Date.now() - startTime;
      console.log(`[AI Agent] Message processed in ${processingTime}ms`);
    } catch (error) {
      console.error('[AI Agent] Error processing message:', error);
      
      // Capture error in Sentry with context
      Sentry.captureException(error, {
        tags: {
          component: 'ai-agent',
          tenantId: params.tenantId,
        },
        extra: {
          contactId: params.contactId,
          conversationId: params.conversationId,
          messageContent: params.messageContent?.substring(0, 200),
        },
      });
      
      // Send error message to user
      await this.sendErrorMessage(params, context || undefined);
      
      // Log error for investigation
      await this.logProcessingError(params, error as Error, aiResponse, handoffDetected);
    }
  }

  /**
   * Load conversation context
   */
  private async loadContext(
    tenantId: string,
    contactId: string,
    conversationId: string
  ): Promise<ConversationContext> {
    const [tenant, contact, conversation, messages, customPrompt] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single(),
      supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single(),
      supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single(),
      supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(20),
      // Load tenant's custom system prompt from ai_prompts table
      supabaseAdmin
        .from('ai_prompts')
        .select('content')
        .eq('tenant_id', tenantId)
        .eq('prompt_type', 'system')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Inject custom prompt into tenant object for buildSystemPrompt
    const tenantData = tenant.data || {};
    if (customPrompt?.data?.content) {
      tenantData.ai_system_prompt = customPrompt.data.content;
    }

    return {
      tenant: tenantData,
      contact: contact.data,
      conversation: conversation.data,
      messages: messages.data || [],
    };
  }

  /**
   * Build system prompt for AI - using simplified state-managed approach
   */
  private async buildSystemPrompt(
    tenant: any,
    contact: any,
    language: string,
    messages: any[],
    lastToolCalls: any[] = []
  ): Promise<{ prompt: string; hasRecentBooking: boolean; state: ConversationState }> {
    try {
      // Defensive checks
      if (!contact) {
        console.error('[Agent] CRITICAL: contact is null/undefined');
        throw new Error('Contact is required');
      }
      if (!contact.id) {
        console.error('[Agent] CRITICAL: contact.id is missing', contact);
        throw new Error('Contact ID is required');
      }

      // Format conversation history (last 5 messages)
      const history = messages
        ?.slice(-5)
        ?.map(m => `${m?.sender_type === 'contact' ? 'Customer' : 'Assistant'}: ${m?.content || ''}`)
        ?.join('\n') || '';

      // Check if there's a recent booking (within last 30 minutes)
      const { data: recentBooking } = await supabaseAdmin
        .from('appointments')
        .select('id, scheduled_time, customer_name, status, created_at')
        .eq('contact_id', contact.id)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasRecentBooking = !!(recentBooking && 
        new Date(recentBooking.created_at) > new Date(Date.now() - 30 * 60 * 1000));

      // Determine conversation state with error handling
      let stateResult;
      try {
        stateResult = determineConversationState(
          messages?.length || 0,
          contact,
          lastToolCalls || [],
          hasRecentBooking
        );
        console.log('[Agent] State determined:', {
          state: stateResult?.state,
          context: stateResult?.context,
          messageCount: messages?.length,
          hasRecentBooking,
          contactName: contact?.name,
          contactEmail: contact?.email,
        });
      } catch (stateError) {
        console.error('[Agent] State manager error:', stateError);
        // Fall back to default state
        stateResult = {
          state: 'general_chat' as ConversationState,
          context: 'ERROR FALLBACK: Default state due to state manager error',
          allowedTools: ['update_lead', 'check_calendar'],
          blockedTools: [],
          promptAddendum: 'Start by asking what they are looking for.',
        };
      }

      // Build simplified system prompt with error handling
      let systemPrompt;
      try {
        systemPrompt = buildSimplifiedPrompt(
          tenant?.company_name || 'Our Company',
          tenant?.ai_assistant_name || 'Assistant',
          tenant?.industry || 'other',
          stateResult?.promptAddendum || '',
          contact,
          history
        );
      } catch (promptError) {
        console.error('[Agent] Prompt builder error:', promptError);
        // Fall back to minimal prompt
        systemPrompt = `You are a helpful assistant from ${tenant?.company_name || 'Our Company'}. Be warm and professional. Ask what the customer is looking for.`;
      }

      return { 
        prompt: systemPrompt, 
        hasRecentBooking,
        state: stateResult?.state || 'general_chat'
      };
    } catch (error) {
      console.error('[Agent] buildSystemPrompt error:', error);
      // Return safe fallback that won't crash
      return {
        prompt: `You are a helpful assistant. Be warm and professional. Ask what the customer is looking for.`,
        hasRecentBooking: false,
        state: 'general_chat'
      };
    }
  }

  /**
   * Format conversation history for AI
   */
  private formatHistory(messages: any[]): any[] {
    return messages
      .filter(m => m.sender_type !== 'system')
      .filter(m => m.content && m.content.trim().length > 0) // 🔥 HIGH-5 FIX: Skip empty messages
      .map(m => ({
        role: m.sender_type === 'contact' ? 'user' : 'assistant',
        content: m.content,
      }))
      .slice(-10); // Last 10 messages
  }

  /**
   * Call AI provider — OpenAI primary, Anthropic fallback
   */
  private async callAI(params: {
    provider: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    newMessage: string;
    tools: any[];
    language: string;
    tenant: any;
    contact: any;
  }): Promise<AIResponse> {
    // 🔥 DEBUG LOGGING: Track conversation history AND contact data
    console.log('\n=== 🔍 BEFORE API CALL ===');
    console.log('Contact data in system prompt:', {
      name: params.contact.name || 'unknown',
      email: params.contact.email || 'not collected yet',
      budget_range: params.contact.budget_range || 'unknown',
      service_interest: params.contact.service_interest || 'unknown',
      timeline: params.contact.timeline || 'unknown',
      temperature: params.contact.temperature || 'new',
    });
    console.log(`Messages in history: ${params.messages.length}`);
    console.log(`New message: "${params.newMessage.substring(0, 50)}..."`);
    console.log(`Tools available: ${params.tools?.length || 0}`);
    console.log('Last 3 history messages:', params.messages.slice(-3).map(m => ({ 
      role: m.role, 
      content: m.content?.substring(0, 50),
      hasToolCalls: !!m.tool_calls,
      toolCallId: m.tool_call_id,
    })));
    console.log('=== END DEBUG ===\n');

    const callOptions = {
      systemPrompt: params.systemPrompt,
      messages: params.messages,
      newMessage: params.newMessage,
      tools: params.tools,
      language: params.language,
      temperature: 0.7,
      maxTokens: 1000,
    };

    // --- SINGLE AI PROVIDER: Claude Sonnet 4 ---
    // Simplified architecture: One model, no fallbacks, maximum reliability
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicKey) {
      console.error('[AI Agent] ANTHROPIC_API_KEY not set - cannot process messages');
      throw new Error('AI service not configured. Please set ANTHROPIC_API_KEY.');
    }
    
    // Always use Claude Sonnet 4 - best balance of quality, speed, and cost
    const MODEL = 'claude-sonnet-4-20250514';
    console.log(`[AI Agent] Using Claude Sonnet 4 (${MODEL})`);
    
    try {
      const { AnthropicProvider } = require('./providers/anthropic');
      const anthropicProvider = new AnthropicProvider(anthropicKey, MODEL);
      const { getAvailableTools } = require('./tools');
      const tools = (params.tools && params.tools.length > 0) ? getAvailableTools('anthropic') : undefined;
      
      if (tools && tools.length > 0) {
        console.log(`[AI Agent] Tools available: ${tools.map((t: any) => t.name).join(', ')}`);
      }
      
      const response = await anthropicProvider.call({ ...callOptions, ...(tools ? { tools } : {}) });
      console.log('[AI Agent] Claude response received successfully');
      return response;
    } catch (error) {
      // 🔥 MED-6 FIX: Return fallback instead of re-throwing (was unreachable code before)
      console.error('[AI Agent] Claude API call failed, returning fallback response:', error);
      const fallbackMessage = this.generateFallbackResponse(params.newMessage, params.language);
      return {
        message: fallbackMessage,
        content: fallbackMessage,
        confidence: 0.1,
        intent: 'error',
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Generate fallback response when AI fails
   */
  private generateFallbackResponse(message: string, language: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return language === 'ar' ? 'مرحباً! كيف يمكنني مساعدتك اليوم؟' : 'Hello! How can I help you today?';
    } else if (lowerMessage.includes('appointment') || lowerMessage.includes('book')) {
      return language === 'ar' ? 'يسعدني حجز موعد لك. سيتواصل معك فريقنا قريباً.' : "I'd be happy to book an appointment for you. Our team will contact you shortly.";
    } else if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
      return language === 'ar' ? 'للحصول على معلومات الأسعار، سيتواصل معك فريقنا قريباً.' : 'For pricing information, our team will contact you shortly.';
    } else {
      return language === 'ar' ? 'شكراً لرسالتك. سيعود إليك فريقنا قريباً.' : 'Thank you for your message. Our team will get back to you shortly.';
    }
  }

  /**
   * Detect intent from message
   */
  private detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('appointment') || lowerMessage.includes('book')) return 'booking';
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) return 'pricing';
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) return 'greeting';
    if (lowerMessage.includes('complaint') || lowerMessage.includes('problem')) return 'complaint';
    
    return 'inquiry';
  }

  /**
   * Detect sentiment from message
   */
  private detectSentiment(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('angry') || lowerMessage.includes('frustrated')) return 'negative';
    if (lowerMessage.includes('happy') || lowerMessage.includes('great')) return 'positive';
    
    return 'neutral';
  }

  /**
   * Get available tools for AI
   */
  private getAvailableTools(tenant: any): any[] {
    // Import tools dynamically
    const { getAvailableTools } = require('./tools');
    return getAvailableTools(tenant.ai_provider || 'openai');
  }

  /**
   * Execute AI tool calls
   */
  private async executeTools(toolCalls: ToolCall[], context: ConversationContext): Promise<void> {
    for (const toolCall of toolCalls) {
      try {
        console.log(`[AI Agent] Executing tool: ${toolCall.name}`);
        
        // Prepare parameters with context
        const parameters = {
          ...toolCall.parameters,
          tenantId: context.tenant.id,
          contactId: context.contact.id,
          conversationId: context.conversation.id,
        };

        // Execute the tool
        let result = await executeTool(toolCall.name, parameters, context);
        
        // Smart retry logic for check_calendar failures
        if (toolCall.name === 'check_calendar' && !result.success) {
          console.log('[AI Agent] check_calendar failed, attempting retry with wider date range');
          result = await this.retryCheckCalendar(parameters, context, result.error);
        }
        
        // Store result
        toolCall.result = result;
        
        // Log success
        if (result.success) {
          console.log(`[AI Agent] Tool ${toolCall.name} executed successfully`);
        } else {
          console.error(`[AI Agent] Tool ${toolCall.name} failed:`, result.error);
        }
      } catch (error) {
        console.error(`[AI Agent] Error executing tool ${toolCall.name}:`, error);
        toolCall.result = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }
  }

  /**
   * Retry check_calendar with exponential backoff and wider date ranges
   */
  private async retryCheckCalendar(
    parameters: any,
    context: ConversationContext,
    previousError?: string
  ): Promise<any> {
    const maxRetries = 2;
    const retryDelays = [500, 1000]; // ms
    const daysAheadProgression = [14, 30]; // Wider search windows
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        
        // Retry with wider date range
        const retryParams = {
          ...parameters,
          daysAhead: daysAheadProgression[attempt],
          preferredDate: undefined, // Clear specific date preference to widen search
        };
        
        console.log(`[AI Agent] Retry ${attempt + 1}/${maxRetries}: searching ${daysAheadProgression[attempt]} days ahead`);
        
        const result = await executeTool('check_calendar', retryParams, context);
        
        if (result.success && result.available_slots?.length > 0) {
          console.log(`[AI Agent] Retry ${attempt + 1} succeeded with ${result.available_slots.length} slots`);
          return result;
        }
        
        console.warn(`[AI Agent] Retry ${attempt + 1} returned no slots`);
      } catch (error) {
        console.error(`[AI Agent] Retry ${attempt + 1} failed:`, error);
      }
    }
    
    // All retries exhausted - mark for human handoff
    console.error('[AI Agent] All calendar retry attempts failed, escalating to human');
    
    // Update contact to need human assistance
    try {
      await executeTool('update_lead', {
        tenantId: context.tenant.id,
        contactId: context.contact.id,
        conversationId: context.conversation.id,
        notes: 'Calendar unavailable - needs human scheduling assistance',
      }, context);
    } catch (updateError) {
      console.error('[AI Agent] Failed to update lead after calendar retry failure:', updateError);
    }
    
    return {
      success: false,
      error: `No available appointment slots found. ${previousError || 'Calendar service unavailable.'}`,
      needs_human: true,
    };
  }

  /**
   * Request human handoff
   */
  private async requestHumanHandoff(
    conversationId: string,
    reason: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<void> {
    await supabaseAdmin
      .from('conversations')
      .update({
        status: 'handoff-requested',
        handoff_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // Notify human agents
    await redisQueue.queueMessage({
      type: 'ai_response', // Using existing type with handoff payload
      tenantId: '', // Will be filled by queue
      payload: {
        conversationId,
        reason,
        priority,
        timestamp: new Date().toISOString(),
        handoffRequest: true,
      },
      maxRetries: 3,
    });
  }

  /**
   * Save message to database
   */
  private async saveMessage(messageData: any): Promise<void> {
    await supabaseAdmin.from('messages').insert({
      ...messageData,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Update lead score
   */
  private async updateLeadScore(
    contactId: string,
    qualificationData?: AIResponse['qualificationData']
  ): Promise<void> {
    if (!qualificationData) return;

    // Get industry from contact's tenant
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('tenant_id')
      .eq('id', contactId)
      .single();

    if (!contact) return;

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('industry')
      .eq('id', contact.tenant_id)
      .single();

    // Calculate score based on qualification data
    const responses = {
      budget: qualificationData.budget ? 'provided' : undefined,
      timeline: qualificationData.timeline,
      interest_level: qualificationData.interestLevel > 70 ? 'high' : qualificationData.interestLevel > 40 ? 'medium' : 'low',
    };

    const { score } = calculateLeadScore(tenant?.industry || 'other', responses);
    const newScore = Math.min(100, Math.max(0, score));

    // 🔥 HIGH-2 FIX: Only update lead_score here.
    // Do NOT overwrite qualification_status or timeline — those are set by update_lead tool calls.
    await supabaseAdmin
      .from('contacts')
      .update({
        lead_score: newScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);
  }

  /**
   * Update contact temperature
   */
  private async updateContactTemperature(
    contactId: string,
    qualificationData?: AIResponse['qualificationData']
  ): Promise<void> {
    if (!qualificationData) return;

    // 🔥 CRIT-1 FIX: Check current temperature before overwriting
    // If temperature is 'booked', it was set by book_appointment tool — NEVER overwrite it
    const { data: currentContact } = await supabaseAdmin
      .from('contacts')
      .select('temperature')
      .eq('id', contactId)
      .single();

    if (currentContact?.temperature === 'booked') {
      console.log(`[AI Agent] ⏭️ Skipping temperature update — contact is already 'booked'`);
      return;
    }

    let temperature: string = 'cold';
    
    if (qualificationData.interestLevel > 80) temperature = 'hot';
    else if (qualificationData.interestLevel > 50) temperature = 'warm';
    else if (qualificationData.interestLevel > 20) temperature = 'new';

    await supabaseAdmin
      .from('contacts')
      .update({
        temperature,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);
  }

  /**
   * Update conversation insights
   */
  private async updateConversationInsights(
    conversationId: string,
    aiResponse: AIResponse
  ): Promise<void> {
    await supabaseAdmin
      .from('conversations')
      .update({
        ai_confidence_avg: aiResponse.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  }

  /**
   * Send error message to user
   */
  private async sendErrorMessage(
    params: ProcessMessageParams,
    context?: ConversationContext
  ): Promise<void> {
    const errorMessage = params.language === 'ar' 
      ? 'عذراً، أواجه بعض الصعوبة. سيعود إليك فريقنا قريباً.'
      : "I'm sorry, I'm having some trouble. Our team will get back to you shortly.";

    if (context) {
      await twilioService.sendWhatsAppMessage(
        params.tenantId,
        context.contact.whatsapp_number,
        errorMessage
      );
    }
  }

  /**
   * Log processing error
   */
  private async logProcessingError(
    params: ProcessMessageParams,
    error: Error,
    aiResponse: AIResponse | null,
    handoffDetected: HandoffDetection | null
  ): Promise<void> {
    await supabaseAdmin.from('ai_processing_logs').insert({
      tenant_id: params.tenantId,
      contact_id: params.contactId,
      conversation_id: params.conversationId,
      message_content: params.messageContent,
      error_message: error.message,
      error_stack: error.stack,
      ai_response: aiResponse,
      handoff_detected: handoffDetected,
      created_at: new Date().toISOString(),
    });
  }

}

// Export singleton instance
export const aiAgent = AIAgent.getInstance();
