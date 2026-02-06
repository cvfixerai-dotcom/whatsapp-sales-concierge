# AI Prompts System

This document explains the industry-specific AI prompt system with multi-language support for SalesConcierge AI.

## Overview

The prompt system provides tailored AI personalities and workflows for different industries, ensuring the AI assistant speaks the language of each business vertical while maintaining consistent lead qualification and booking processes.

## Supported Industries

### 1. Real Estate 🏠
**Focus**: Property sales and rentals
**Key Qualifications**:
- Budget range
- Move timeline
- Location preferences
- Decision maker status

**Booking Flow**:
1. Qualify budget
2. Qualify timeline
3. Show properties
4. Offer viewing
5. Book appointment

### 2. Automotive 🚗
**Focus**: Vehicle sales
**Key Qualifications**:
- Price range
- Vehicle type (car, SUV, truck)
- Purchase timeline
- Financing needs

**Booking Flow**:
1. Qualify budget
2. Qualify vehicle type
3. Check inventory
4. Offer test drive
5. Book appointment

### 3. Home Services 🔧
**Focus**: Home repair and maintenance
**Key Qualifications**:
- Service type needed
- Urgency level
- Service location
- Budget constraints

**Booking Flow**:
1. Identify issue
2. Assess urgency
3. Provide quote
4. Offer appointment
5. Book service

### 4. Medical 🏥
**Focus**: Appointment scheduling
**Key Qualifications**:
- Symptoms/condition
- Urgency level
- Required specialty
- Insurance information

**Booking Flow**:
1. Assess symptoms
2. Determine urgency
3. Match specialty
4. Offer appointment
5. Book appointment

## Language Support

### English (en)
- Default language
- Full prompt support
- Cultural nuances for Western markets

### Arabic (ar)
- RTL text support
- Culturally appropriate phrasing
- UAE market optimization
- Formal tone with modern touches

## Prompt Structure

Each prompt template includes:

### System Instructions
- Role definition
- Company context
- Service offerings
- Business hours
- FAQ integration

### Qualification Criteria
- Weighted scoring system
- Required vs optional fields
- Industry-specific questions

### Lead Scoring
- Hot (80-100): Ready to buy/book
- Warm (50-79): Considering options
- Cold (<50): Early research

### Available Tools
- Calendar checking
- Appointment booking
- Quote generation
- Information sending

### Response Guidelines
- Character limits (<160 when possible)
- Emoji usage
- Tone and style
- Language matching

## Dynamic Variables

Prompts are personalized with:

```typescript
{
  company_name: string,
  services: Service[],
  business_hours: BusinessHours,
  faqs: FAQ[],
  temperature: 'new' | 'warm' | 'hot' | 'cold',
  lead_score: number,
  timeline: string,
  budget_range: string,
  conversation_history: string
}
```

## Usage Example

```typescript
import { buildSystemPrompt, getPromptTemplate } from '@/lib/ai/prompts';

// Get industry-specific template
const template = getPromptTemplate('real-estate', 'ar');

// Build personalized prompt
const prompt = buildSystemPrompt(tenant, contact, 'ar', history);

// Get qualification criteria
const criteria = getQualificationCriteria('real-estate');

// Calculate lead score
const { score, missingRequired } = calculateLeadScore('automotive', responses);
```

## Customization

### Adding New Industries

1. Create prompt template in `prompts.ts`
2. Define qualification criteria
3. Set up booking flow
4. Add both English and Arabic versions

### Modifying Existing Prompts

1. Update the template in `prompts.ts`
2. Test with sample conversations
3. Adjust weights and criteria as needed
4. Deploy changes

### Tenant Customization

Tenants can override prompts by:
1. Creating custom prompts in database
2. Setting industry to 'other'
3. Using company-specific variables
4. A/B testing different versions

## Best Practices

### Prompt Writing
1. Be specific about the AI role
2. Include clear examples
3. Set boundaries for what AI can/cannot do
4. Provide escalation paths

### Multi-Language
1. Maintain consistency across languages
2. Consider cultural differences
3. Test with native speakers
4. Handle RTL properly for Arabic

### Qualification Design
1. Balance required vs optional fields
2. Weight criteria by importance
3. Avoid overwhelming users
4. Progressive disclosure

## Testing

### Test Scenarios
1. Greeting responses
2. Qualification questions
3. Appointment booking
4. Error handling
5. Language switching

### Metrics to Track
- Response relevance
- Lead qualification accuracy
- Booking conversion rate
- Customer satisfaction
- Language preference adherence

## Future Enhancements

1. **Dynamic Prompts**: AI-generated prompt variations
2. **A/B Testing**: Automatic prompt optimization
3. **Sentiment Analysis**: Emotion-aware responses
4. **More Languages**: Spanish, French, Chinese
5. **Voice Integration**: Spoken conversation support
6. **Industry Expansion**: Legal, Finance, Education
