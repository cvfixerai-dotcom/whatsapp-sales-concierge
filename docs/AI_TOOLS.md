# AI Tools System

This document explains the AI tools that enable the SalesConcierge AI assistant to perform actions beyond just conversation.

## Overview

The AI tools system allows the AI assistant to:
- Update lead information and scores
- Check calendar availability
- Book appointments
- Send emails
- Calculate lead scores

## Available Tools

### 1. update_lead
Updates contact information and recalculates lead score.

**Parameters:**
- `contactId` (string, required): Contact ID to update
- `updates` (object, required): Fields to update
  - `name` (string): Contact name
  - `email` (string): Contact email
  - `temperature` (string): Lead temperature (new/warm/hot/cold/booked)
  - `timeline` (string): Purchase timeline
  - `budget_range` (string): Budget range
  - `service_interest` (string): Service of interest
  - `metadata` (object): Additional metadata

**Example Usage:**
```javascript
{
  "name": "update_lead",
  "parameters": {
    "contactId": "contact_123",
    "updates": {
      "budget_range": "$5000-$10000",
      "timeline": "this-month",
      "temperature": "hot"
    }
  }
}
```

### 2. check_calendar
Checks available appointment slots using Calendly integration.

**Parameters:**
- `tenantId` (string, required): Tenant ID
- `preferredDate` (string, optional): Preferred date to check

**Returns:**
- `available_slots`: Array of available time slots
  - `datetime`: ISO datetime string
  - `formatted`: Human-readable format

**Example Usage:**
```javascript
{
  "name": "check_calendar",
  "parameters": {
    "tenantId": "tenant_456",
    "preferredDate": "2024-01-15T10:00:00Z"
  }
}
```

### 3. book_appointment
Books an appointment via Calendly and saves to database.

**Parameters:**
- `tenantId` (string, required): Tenant ID
- `contactId` (string, required): Contact ID
- `conversationId` (string, required): Conversation ID
- `slotTime` (string, required): Appointment slot time (ISO format)

**Returns:**
- `meeting_link`: URL to join the meeting
- `meeting_time`: Scheduled time

**Side Effects:**
- Creates appointment record in database
- Updates contact temperature to 'booked'
- Sends confirmation email (if email exists)

**Example Usage:**
```javascript
{
  "name": "book_appointment",
  "parameters": {
    "tenantId": "tenant_456",
    "contactId": "contact_123",
    "conversationId": "conv_789",
    "slotTime": "2024-01-15T14:00:00Z"
  }
}
```

### 4. send_email
Sends templated emails to contacts.

**Parameters:**
- `to` (string, required): Recipient email
- `template` (string, required): Email template name
- `data` (object, required): Template data
- `language` (string, optional): Language (en/ar, default: en)

**Available Templates:**
- `booking_confirmation`: Appointment confirmation
- `lead_info`: General information

**Example Usage:**
```javascript
{
  "name": "send_email",
  "parameters": {
    "to": "customer@example.com",
    "template": "booking_confirmation",
    "data": {
      "company_name": "ACME Corp",
      "meeting_time": "Jan 15, 2024 at 2:00 PM",
      "meeting_link": "https://zoom.us/j/123456789"
    },
    "language": "en"
  }
}
```

### 5. calculate_score
Calculates lead score based on contact information.

**Parameters:**
- `contactId` (string, required): Contact ID

**Scoring Criteria:**
- Has email: +10 points
- Has name: +10 points
- Budget confirmed: +25 points
- Timeline urgency: 5-20 points
- Service interest: +15 points
- Temperature: 0-20 points
- Message count: 5-10 points
- Appointment booked: +20 points

**Returns:**
- Score from 0-100

**Example Usage:**
```javascript
{
  "name": "calculate_score",
  "parameters": {
    "contactId": "contact_123"
  }
}
```

## Tool Execution Flow

1. **AI Decision**: AI decides to use a tool based on conversation
2. **Parameter Validation**: Tool parameters are validated
3. **Execution**: Tool handler function is called
4. **Result Processing**: Result is stored and logged
5. **Error Handling**: Errors are caught and logged

## Error Handling

All tools implement comprehensive error handling:
- Validation errors return descriptive messages
- API errors are caught and logged
- Database failures don't break the flow
- Fallback behavior for missing data

## Integration Points

### Calendly Integration
- Requires tenant `calendly_api_key` and `calendly_event_url`
- Supports business hours filtering
- Handles timezone conversions

### SendGrid Integration
- Requires `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`
- Multi-language templates
- HTML and text versions

### Database Integration
- All operations use Supabase client
- Proper error handling for database failures
- Consistent data structure

## Security Considerations

1. **API Keys**: Stored in environment variables
2. **Data Validation**: All inputs are validated
3. **Rate Limiting**: Respects external API limits
4. **Error Logging**: No sensitive data in logs

## Adding New Tools

1. Create tool file in `/lib/ai/tools/`
2. Export the function
3. Add to `AI_TOOLS` registry in `index.ts`
4. Update documentation

Example new tool:
```typescript
// /lib/ai/tools/my-tool.ts
export async function myTool(params: MyToolParams): Promise<MyToolResult> {
  // Implementation
}
```

## Testing Tools

Each tool should be tested with:
- Valid parameters
- Invalid parameters
- API failures
- Database errors
- Edge cases

## Monitoring

Tool execution is logged with:
- Tool name
- Parameters (sanitized)
- Success/failure status
- Execution time
- Error messages

## Best Practices

1. **Idempotency**: Tools should be safe to retry
2. **Atomicity**: Operations should complete fully or not at all
3. **Validation**: Always validate inputs
4. **Logging**: Log important actions and errors
5. **Fallbacks**: Provide fallback behavior when possible
