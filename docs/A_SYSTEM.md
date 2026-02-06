# AI Conversation Orchestration Engine

This document explains the AI conversation orchestration system that powers SalesConcierge AI's WhatsApp sales assistant.

## Overview

The AI system processes inbound WhatsApp messages, generates contextual responses, qualifies leads, and handles appointment booking. It supports multiple AI providers (Claude/Anthropic and GPT/OpenAI) with intelligent handoff to human agents when needed.

## Architecture

```
Inbound Message → AI Agent → Context Loading → Prompt Building → AI Provider
                                                          ↓
                                                    Tool Execution
                                                          ↓
                                                    Handoff Detection
                                                          ↓
                                                    Response Generation
                                                          ↓
                                                    WhatsApp Delivery
```

## Key Components

### 1. AI Agent (`/lib/ai/agent.ts`)

The main orchestrator that:
- Loads conversation context (tenant, contact, history)
- Builds dynamic system prompts
- Calls AI providers with tools
- Processes tool calls (booking, pricing, etc.)
- Detects handoff triggers
- Updates lead scoring and qualification

### 2. AI Providers (`/lib/ai/providers/`)

Provider implementations for:
- **Anthropic (Claude)**: Default provider, excellent at following instructions
- **OpenAI (GPT)**: Alternative provider, good for creative responses

Both providers support:
- System prompts for context
- Conversation history
- Tool/function calling
- Multi-language support (English/Arabic)

### 3. Tool System

AI can execute tools to perform actions:
- `check_availability` - Check appointment slots
- `book_appointment` - Book meetings
- `get_pricing` - Retrieve pricing info
- `request_handoff` - Transfer to human

## Conversation Flow

### 1. Message Processing
```javascript
await aiAgent.processInboundMessage({
  tenantId: 'tenant_123',
  contactId: 'contact_456',
  conversationId: 'conv_789',
  messageContent: 'Hi, I want to book a demo',
  language: 'en'
});
```

### 2. Context Loading
- Tenant configuration (services, hours, prompts)
- Contact information (lead score, history)
- Recent conversation messages (last 20)

### 3. Dynamic Prompt Building
System prompts are customized with:
- Company name and services
- Business hours
- Contact's name and language
- Qualification criteria

### 4. AI Response Generation
The AI receives:
- System prompt (context)
- Conversation history
- New message
- Available tools

Returns:
- Response message
- Confidence score (0-1)
- Intent classification
- Sentiment analysis
- Qualification data
- Tool calls (if any)

### 5. Handoff Detection

Automatic handoff triggers:
- **Low confidence** (< 70%)
- **High-value lead** (score > 80 + high budget)
- **Keyword triggers** (human, agent, complaint)
- **Negative sentiment** + complaint intent
- **Complex queries** (multiple questions)

### 6. Lead Qualification

The AI extracts and updates:
- **Interest level** (0-100)
- **Timeline** (urgent, this-week, etc.)
- **Budget range** (low, medium, high)
- **Service interest**
- **Next action** (book, follow-up, etc.)

## Multi-Language Support

### Arabic Support
- RTL text handling
- Arabic prompts and responses
- Cultural nuances considered
- Automatic language detection

### Language Detection
Based on contact's preference:
- Stored in contact record
- Defaults to English
- Can be updated dynamically

## Configuration

### Tenant Settings
```javascript
{
  ai_provider: 'anthropic', // or 'openai'
  ai_model: 'claude-3-sonnet-20240229',
  language: ['en', 'ar'],
  services: [...],
  business_hours: {...},
  custom_prompts: {...}
}
```

### Custom Prompts
Tenants can customize:
- System prompts
- Industry-specific responses
- Qualification questions
- Brand voice

## Error Handling

### Graceful Degradation
- API failures → Fallback responses
- Rate limits → Queue messages
- Errors → Human notification

### Logging
All AI interactions logged to:
- `ai_processing_logs` table
- Error tracking
- Performance metrics
- Handoff reasons

## Performance Optimization

### Caching
- System prompts cached
- Tool results cached
- Rate limit caching

### Async Processing
- All processing in queue
- Non-blocking responses
- Retry on failures

## Monitoring

### Key Metrics
- Response time
- Confidence scores
- Handoff rate
- Lead conversion

### Health Checks
```bash
# Check AI status
curl /api/ai/status

# View processing logs
curl /api/ai/logs
```

## Security

### API Keys
- Stored in environment variables
- Per-provider configuration
- Rotation support

### Data Privacy
- No PII in prompts
- Optional data retention
- GDPR compliance

## Testing

### Mock Provider
For testing without API calls:
```javascript
const mockProvider = new MockAIProvider();
```

### Test Scenarios
- Greeting responses
- Appointment booking
- Pricing inquiries
- Complaint handling
- Handoff triggers

## Best Practices

### Prompt Engineering
- Clear instructions
- Context boundaries
- Output formatting
- Safety guidelines

### Tool Design
- Specific purposes
- Clear parameters
- Error handling
- Idempotent operations

### Handoff Logic
- Clear triggers
- Priority levels
- Context preservation
- Smooth transitions

## Troubleshooting

### Common Issues
1. **Low confidence responses**
   - Check system prompt clarity
   - Verify context quality
   - Review conversation history

2. **Excessive handoffs**
   - Adjust confidence thresholds
   - Review keyword triggers
   - Improve prompt instructions

3. **Slow responses**
   - Check API rate limits
   - Optimize prompt length
   - Consider model selection

4. **Language issues**
   - Verify language detection
   - Check prompt translations
   - Review cultural context

## Future Enhancements

1. **Advanced NLP**
   - Entity recognition
   - Sentiment analysis
   - Intent classification

2. **Learning System**
   - Response optimization
   - A/B testing
   - Performance analytics

3. **Voice Support**
   - Speech-to-text
   - Voice responses
   - Phone integration

4. **Multi-Channel**
   - Facebook Messenger
   - Instagram DMs
   - Website chat
