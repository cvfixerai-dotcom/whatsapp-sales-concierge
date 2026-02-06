// @ts-nocheck
import { BaseAIProvider, AIProviderParams } from './index';
import { AIResponse } from '../agent';
import { supabaseAdmin } from '../../db/client';

export class OpenAIProvider extends BaseAIProvider {
  async call(params: AIProviderParams): Promise<AIResponse> {
    try {
      const messages = this.formatMessages(
        params.systemPrompt,
        params.messages,
        params.newMessage
      );

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: params.temperature || 0.7,
          max_tokens: params.maxTokens || 1000,
          tools: params.tools.length > 0 ? params.tools : undefined,
          tool_choice: params.tools.length > 0 ? 'auto' : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      // Extract message content
      const message = choice.message;
      let messageText = message.content || '';
      let toolCalls: any[] = [];

      // Extract tool calls if present
      if (message.tool_calls) {
        toolCalls = message.tool_calls.map((tc: any) => ({
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments),
        }));
      }

      return {
        message: messageText,
        confidence: this.calculateConfidence(messageText, params),
        intent: this.detectIntent(params.newMessage),
        sentiment: this.detectSentiment(params.newMessage),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        qualificationData: this.extractQualificationData(messageText, params.newMessage),
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      
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
