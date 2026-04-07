# WhatsApp Sales Concierge - Complete Testing Guide

## Overview

This guide covers end-to-end testing of the WhatsApp Sales Concierge system. The system consists of:

1. **Dashboard** - Web UI for managing leads, conversations, and analytics
2. **Twilio Webhook** - Receives incoming WhatsApp messages
3. **Message Queue** - Redis-based async processing
4. **AI Agent** - Processes messages and generates responses
5. **Billing System** - Tracks usage and handles payments via Paystack

---

## Prerequisites

### 1. Environment Setup

Ensure your `.env` file has all required values:

```bash
# Required for core functionality
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=http://localhost:3000

# Required for AI responses
ANTHROPIC_API_KEY=your_anthropic_key
# OR
OPENAI_API_KEY=your_openai_key

# Required for WhatsApp
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token

# Required for message queue
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

### 2. Database Setup

Run these SQL files in Supabase SQL Editor (in order):

1. `src/lib/db/schema.sql` - Core tables
2. `src/lib/db/billing-schema.sql` - Billing tables
3. `src/lib/db/handoff-schema.sql` - Handoff tables
4. `src/lib/db/dashboard-kpis.sql` - Dashboard views
5. `src/lib/db/ai-processing-logs.sql` - AI logging

### 3. Tenant Configuration

Your tenant in Supabase should have:
- `twilio_whatsapp_number` - Your Twilio WhatsApp number (format: `whatsapp:+1234567890`)
- `ai_provider` - Either `anthropic` or `openai`
- `ai_model` - Model name (e.g., `claude-3-sonnet-20240229`)
- `subscription_status` - Set to `active`

---

## Testing Scenarios

### Phase 1: Dashboard Testing

#### 1.1 Authentication
- [x] Login with valid credentials
- [ ] Login with invalid credentials (should show error)
- [ ] Logout functionality
- [ ] Session persistence (refresh page, should stay logged in)

#### 1.2 Dashboard Overview
- [ ] KPI cards display (even if 0)
- [ ] Charts render (Conversation Volume, Lead Temperature)
- [ ] Recent Activity section
- [ ] Quick Actions buttons work

#### 1.3 Leads Page
Navigate to `/dashboard/leads`:
- [ ] View all leads
- [ ] Filter leads by temperature
- [ ] Search leads
- [ ] Click on a lead to view details

#### 1.4 Conversations Page
Navigate to `/dashboard/conversations`:
- [ ] View conversation list
- [ ] Click to view conversation details
- [ ] See message history

---

### Phase 2: WhatsApp Integration Testing

#### 2.1 Local Testing with ngrok

Since Twilio needs a public URL, use ngrok:

```bash
# Install ngrok if not installed
brew install ngrok

# Start ngrok tunnel
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

#### 2.2 Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging** → **Try it out** → **Send a WhatsApp message**
3. Or go to **Messaging** → **Services** → Your Service → **Sender Pool**
4. Click on your WhatsApp Sender
5. Set the webhook URL to: `https://your-ngrok-url.ngrok.io/api/webhook/twilio`
6. Set HTTP method to **POST**

#### 2.3 Update Tenant WhatsApp Number

In Supabase, update your tenant:

```sql
UPDATE tenants 
SET twilio_whatsapp_number = 'whatsapp:+14155238886'  -- Your Twilio number
WHERE company_name = 'FixerAI Technologies Ltd';
```

#### 2.4 Start the Message Worker

The worker processes queued messages. Start it in a separate terminal:

```bash
npm run workers
```

Or start via API:
```bash
curl -X POST http://localhost:3000/api/workers/start
```

#### 2.5 Send Test Message

1. Add Twilio Sandbox number to your WhatsApp contacts
2. Send the join code (e.g., "join <sandbox-code>")
3. Send a test message like "Hello, I'm interested in your services"

#### 2.6 Verify Message Flow

Check these in order:

1. **Twilio Console** - Message received
2. **Server Logs** - Webhook received
3. **Supabase** - Check `contacts` table for new contact
4. **Supabase** - Check `conversations` table for new conversation
5. **Supabase** - Check `messages` table for inbound message
6. **Redis** - Message queued for AI processing
7. **WhatsApp** - AI response received

---

### Phase 3: AI Response Testing

#### 3.1 Test Different Scenarios

Send these messages to test AI behavior:

| Message | Expected Behavior |
|---------|-------------------|
| "Hi, I need help" | Greeting + ask about needs |
| "How much does it cost?" | Provide pricing info |
| "I want to book an appointment" | Trigger booking flow |
| "I need to speak to a human" | Trigger handoff |
| "مرحبا" (Arabic) | Respond in Arabic |

#### 3.2 Check AI Logs

In Supabase, check `ai_processing_logs` table:

```sql
SELECT * FROM ai_processing_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

---

### Phase 4: Billing Testing

#### 4.1 Check Usage Tracking

After sending messages, verify usage:

```sql
SELECT * FROM conversation_usage 
WHERE tenant_id = 'your-tenant-id';
```

#### 4.2 Test Billing API

```bash
# Get usage
curl http://localhost:3000/api/billing/usage \
  -H "Cookie: your-session-cookie"

# Subscribe (requires Paystack setup)
curl -X POST http://localhost:3000/api/billing/subscribe \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{"plan": "starter"}'
```

---

### Phase 5: Handoff Testing

#### 5.1 Trigger Handoff

Send a message that triggers handoff:
- "I need to speak to a human"
- "This is urgent"
- "I'm not satisfied with the AI"

#### 5.2 Verify Handoff

1. Check `conversations` table - status should be `handoff-requested`
2. Check `handoff_logs` table for handoff record
3. Dashboard should show handoff in "Handoff Requests" section

#### 5.3 Claim Handoff

```bash
curl -X POST http://localhost:3000/api/handoffs/claim \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{"conversationId": "conversation-uuid"}'
```

#### 5.4 Resolve Handoff

```bash
curl -X POST http://localhost:3000/api/handoffs/resolve \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{"conversationId": "conversation-uuid", "resolution": "Issue resolved"}'
```

---

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Messages

- Check ngrok is running and URL is correct
- Verify Twilio webhook URL is set correctly
- Check Twilio Console for webhook errors
- Ensure signature verification is passing

#### 2. AI Not Responding

- Check worker is running (`npm run workers`)
- Verify AI API keys are valid
- Check Redis queue for stuck messages:
  ```bash
  # In your app, call:
  curl http://localhost:3000/api/rate-limit/status
  ```

#### 3. Messages Not Saving to Database

- Check Supabase connection
- Verify RLS policies allow inserts
- Check server logs for database errors

#### 4. Dashboard Shows No Data

- Verify you're logged in with correct tenant
- Check browser console for errors
- Verify `dashboard_kpis` view exists in Supabase

---

## API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/twilio` | POST | Twilio webhook for incoming messages |
| `/api/webhook/twilio` | GET | Health check |
| `/api/billing/usage` | GET | Get current usage |
| `/api/billing/subscribe` | POST | Subscribe to a plan |
| `/api/billing/topup` | POST | Purchase conversation top-up |
| `/api/handoffs/claim` | POST | Claim a handoff request |
| `/api/handoffs/resolve` | POST | Resolve a handoff |
| `/api/workers/start` | POST | Start message workers |
| `/api/webhooks/paystack` | POST | Paystack payment webhook |

---

## Production Deployment Checklist

- [ ] Set `NEXTAUTH_URL` to production URL
- [ ] Update Twilio webhook to production URL
- [ ] Set up Paystack webhooks for production
- [ ] Configure proper CORS settings
- [ ] Enable Supabase RLS policies
- [ ] Set up monitoring and alerting
- [ ] Configure rate limiting
- [ ] Set up backup for Redis queue
- [ ] Test all flows in production environment

---

## Quick Test Commands

```bash
# Start dev server
npm run dev

# Start workers (separate terminal)
npm run workers

# Start ngrok (separate terminal)
ngrok http 3000

# Check webhook health
curl http://localhost:3000/api/webhook/twilio

# Simulate webhook (for testing without Twilio)
curl -X POST http://localhost:3000/api/webhook/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=test123&From=whatsapp:+1234567890&To=whatsapp:+14155238886&Body=Hello"
```

Note: The simulated webhook will fail signature verification. For local testing without Twilio, you may need to temporarily disable signature verification in development.
