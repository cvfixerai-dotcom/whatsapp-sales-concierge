// @ts-nocheck
import { BaseAIProvider, AIProviderParams } from './index';
import { AIResponse } from '../agent';

export class AnthropicProvider extends BaseAIProvider {
  async call(params: AIProviderParams): Promise<AIResponse> {
    try {
      const messages = this.formatMessages(
        params.systemPrompt,
        params.messages,
        params.newMessage
      );

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
          messages: messages.slice(1), // Exclude system message
          system: params.systemPrompt,
          tools: params.tools.length > 0 ? params.tools : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
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
        confidence: this.calculateConfidence(messageText, params),
        intent: this.detectIntent(params.newMessage),
        sentiment: this.detectSentiment(params.newMessage),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        qualificationData: this.extractQualificationData(messageText, params.newMessage),
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      
      // Return a fallback response
      return {
        message: params.language === 'ar' 
          ? 'عذراً، أواجه بعض الصعوبة. سيعود إليك فريقنا قريباً.'
          : "I'm sorry, I'm having some trouble. Our team will get back to you shortly.",
        confidence: 0.1,
        intent: 'error',
        sentiment: 'neutral',
      };
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
