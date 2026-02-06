import { AIResponse, ToolCall } from '../agent';

export interface AIProvider {
  call(params: AIProviderParams): Promise<AIResponse>;
}

export interface AIProviderParams {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  newMessage: string;
  tools: any[];
  language: string;
  temperature?: number;
  maxTokens?: number;
}

export abstract class BaseAIProvider implements AIProvider {
  protected apiKey: string;
  protected model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  abstract call(params: AIProviderParams): Promise<AIResponse>;

  protected formatMessages(
    systemPrompt: string,
    history: Array<{ role: string; content: string }>,
    newMessage: string
  ): Array<{ role: string; content: string }> {
    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: newMessage },
    ];
  }

  protected parseToolCalls(toolCalls: any[]): ToolCall[] {
    return toolCalls.map(tc => ({
      name: tc.function.name,
      parameters: JSON.parse(tc.function.arguments),
    }));
  }

  protected detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('appointment') || lowerMessage.includes('book')) return 'booking';
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) return 'pricing';
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) return 'greeting';
    if (lowerMessage.includes('complaint') || lowerMessage.includes('problem')) return 'complaint';
    if (lowerMessage.includes('interested') || lowerMessage.includes('want')) return 'interest';
    if (lowerMessage.includes('question') || lowerMessage.includes('help')) return 'inquiry';
    
    return 'general';
  }

  protected detectSentiment(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.match(/\b(angry|mad|frustrated|upset|terrible|awful)\b/)) return 'negative';
    if (lowerMessage.match(/\b(happy|great|excellent|perfect|love|amazing)\b/)) return 'positive';
    
    return 'neutral';
  }

  protected calculateConfidence(response: string, context: any): number {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.8; // Base confidence

    // Increase confidence for direct answers
    if (response.length > 10 && response.length < 200) confidence += 0.1;
    
    // Decrease confidence for generic responses
    if (response.includes('I understand') || response.includes('Thank you for')) confidence -= 0.1;
    
    // Ensure confidence is within bounds
    return Math.max(0.1, Math.min(1.0, confidence));
  }
}

// Factory function to get the appropriate provider
export function getAIProvider(provider: string, apiKey: string, model: string): AIProvider {
  switch (provider) {
    case 'anthropic':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AnthropicProvider } = require('./anthropic');
      return new AnthropicProvider(apiKey, model);
    case 'openai':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenAIProvider } = require('./openai');
      return new OpenAIProvider(apiKey, model);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
