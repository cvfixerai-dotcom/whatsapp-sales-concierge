import { BaseAIProvider, AIProviderParams } from './index';
import { AIResponse } from '../agent';

export class AnthropicProvider extends BaseAIProvider {
  /**
   * Override formatMessages to convert OpenAI-style messages to Claude format
   * Claude doesn't support role: 'tool' - it needs tool results in a specific format
   */
  protected formatMessages(
    systemPrompt: string,
    history: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>,
    newMessage: string
  ): Array<any> {
    const messages: any[] = [];
    
    // Process history and convert to Claude format
    for (const msg of history) {
      // Convert tool results (role: 'tool') to Claude's format
      if (msg.role === 'tool') {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content
          }]
        });
      }
      // Convert assistant messages with tool_calls to Claude's format
      else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const content: any[] = [];
        
        // Add text content if present
        if (msg.content && msg.content.trim().length > 0) {
          content.push({ type: 'text', text: msg.content });
        }
        
        // Add tool_use blocks
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name || tc.name,
            input: typeof tc.function?.arguments === 'string' 
              ? JSON.parse(tc.function.arguments) 
              : (tc.parameters || tc.input || {})
          });
        }
        
        messages.push({
          role: 'assistant',
          content: content
        });
      }
      // Regular user/assistant messages
      else if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
      // Skip system messages (handled separately in Claude)
    }
    
    // Add new user message if present
    if (newMessage && newMessage.trim().length > 0) {
      messages.push({ role: 'user', content: newMessage });
    }
    
    return messages;
  }

  async call(params: AIProviderParams): Promise<AIResponse> {
    try {
      const messages = this.formatMessages(
        params.systemPrompt,
        params.messages,
        params.newMessage
      );

      // Tool instructions are in main prompt - no duplication needed
      const toolEnforcementInstruction = '';

      // Log Claude API call
      console.log(`[Anthropic] Calling ${this.model} with ${messages.length} messages, tools: ${params.tools?.length || 0}`);
      if (process.env.DEBUG_ANTHROPIC === 'true') {
        console.log('[Anthropic] Message format check:', messages.map(m => ({
          role: m.role,
          contentType: Array.isArray(m.content) ? 'array' : 'string',
          hasToolResult: Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result'),
          hasToolUse: Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_use')
        })));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: params.maxTokens || 1000,
          temperature: params.temperature || 0.7,
          // 🔥 FIX: formatMessages already skips system messages; they are passed separately
          // via the `system` field below. The previous slice(1) incorrectly dropped the
          // first user message, causing lost context on the opening turn.
          messages,
          system: params.systemPrompt + toolEnforcementInstruction,
          ...(params.tools && params.tools.length > 0 ? { tools: params.tools, tool_choice: { type: 'auto' } } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[Anthropic] API call failed: ${response.status}`, error);
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      // Extract ALL content blocks — text and tool_use
      let messageText = '';
      const toolCalls: any[] = [];

      for (const block of data.content || []) {
        if (block.type === 'text') {
          messageText += (messageText ? '\n' : '') + block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            parameters: block.input,
          });
        }
      }

      console.log(`[Anthropic] Response: ${messageText.substring(0, 100)}... | Tools: ${toolCalls.map(t => t.name).join(', ') || 'none'} | stop_reason: ${data.stop_reason}`);

      // If AI returned tool_use without text, leave message empty so agent can do a follow-up call
      return {
        message: messageText || '',
        content: messageText || '',
        confidence: this.calculateConfidence(messageText, params),
        intent: this.detectIntent(params.newMessage),
        sentiment: this.detectSentiment(params.newMessage),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        qualificationData: this.extractQualificationData(messageText, params.newMessage),
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw error;
    }
  }

  private extractQualificationData(response: string, userMessage: string) {
    // Simple qualification data extraction
    const data: any = {
      interestLevel: 50, // Default
    };

    // Extract timeline
    const timelineKeywords = {
      'urgent': 'urgent',
      'asap': 'urgent',
      'today': 'urgent',
      'this week': 'this-week',
      'next week': 'this-week',
      'this month': 'this-month',
      'exploring': 'exploring',
      'just looking': 'exploring',
    };

    const lowerMessage = userMessage.toLowerCase();
    for (const [keyword, value] of Object.entries(timelineKeywords)) {
      if (lowerMessage.includes(keyword)) {
        data.timeline = value;
        break;
      }
    }

    // Extract budget indicators
    if (lowerMessage.includes('budget') || lowerMessage.includes('price')) {
      if (lowerMessage.includes('high') || lowerMessage.includes('no issue')) {
        data.budget = 'high';
        data.interestLevel = 80;
      } else if (lowerMessage.includes('low') || lowerMessage.includes('cheap')) {
        data.budget = 'low';
        data.interestLevel = 40;
      }
    }

    // Extract service interest
    const serviceKeywords = ['consultation', 'demo', 'trial', 'pricing', 'features'];
    for (const keyword of serviceKeywords) {
      if (lowerMessage.includes(keyword)) {
        data.serviceInterest = keyword;
        data.interestLevel = Math.max(data.interestLevel, 60);
        break;
      }
    }

    // Determine next action
    if (data.timeline === 'urgent' || data.interestLevel > 70) {
      data.nextAction = 'book_appointment';
    } else if (data.interestLevel > 50) {
      data.nextAction = 'send_info';
    } else {
      data.nextAction = 'follow_up';
    }

    return data;
  }
}
