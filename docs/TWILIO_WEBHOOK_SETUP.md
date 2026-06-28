# Twilio Webhook Setup Guide

This document explains how the Twilio webhook handling system works in SalesConcierge AI.

## Architecture Overview

The webhook system is designed for:
- **Reliability**: Idempotency prevents duplicate processing
- **Scalability**: Async processing with Redis queue
- **Performance**: Immediate 200 response to Twilio

## Flow Diagram

```
Twilio → Webhook Endpoint → Verify Signature → Check Idempotency → Queue Message → Return 200
                                                        ↓
                                                Redis Queue
                                                        ↓
                                                Message Processor
                                                        ↓
                                                Save to Database
                                                        ↓
                                                Generate AI Response
                                                        ↓
                                                Send via Twilio
```

## Key Components

### 1. Webhook Endpoint (`/api/webhook/twilio`)
- Verifies Twilio signature using HMAC-SHA1
- Extracts tenant from 'To' number
- Checks for duplicate processing using MessageSid
- Queues message to Redis for async processing
- Returns 200 OK immediately

### 2. Twilio Service (`/lib/services/twilio.ts`)
- Handles webhook signature verification
- Manages rate limiting (1 message/second)
- Sends outbound messages with retry logic
- Tracks webhook processing status

### 3. Redis Queue (`/lib/queue/redis.ts`)
- Upstash Redis for message queuing
- Supports scheduled messages
- Dead letter queue for failures
- Automatic retry with exponential backoff

### 4. Message Processor (`/lib/queue/workers/message-processor.ts`)
- Processes messages from queue
- Implements 24-hour conversation windows
- Creates/updates contacts and conversations
- Triggers AI response generation

## Conversation Window Logic

A "conversation" is defined as all messages within a 24-hour window:
- New message after 24 hours = New conversation (new billing unit)
- Messages within 24 hours = Same conversation
- Each conversation has a unique ID for tracking

## Idempotency

- Uses Twilio MessageSid as unique key
- Stores in `webhook_events` table
- Prevents duplicate processing
- Handles webhook retries gracefully

## Rate Limiting

- WhatsApp Business API: 1 message/second per phone number
- Tracked in `rate_limits` table
- Sliding window implementation
- Automatic throttling when limits reached

## Error Handling

- Webhook always returns 200 (even on errors)
- Errors logged for investigation
- Failed messages moved to DLQ after retries
- Graceful degradation for AI failures

## Setup Instructions

### 1. Configure Twilio
```bash
# In your Twilio console:
# 1. Configure WhatsApp Sandbox or production number
# 2. Set webhook URL: https://yourdomain.com/api/webhook/twilio
# 3. Enable "Accept HTTP POST"
# 4. Add webhook signature token
```

### 2. Set Environment Variables
```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Supabase Edge Function (process-message) — runs the inbound AI pipeline.
# The webhook acks Twilio in <500ms, then fires one authenticated fetch here.
SUPABASE_EDGE_FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/process-message
# PAIRED secret — must exactly match the value set on the deployed function via
# `supabase secrets set EDGE_FUNCTION_SECRET=...`. If they drift the function
# returns 401 and no replies are sent.
EDGE_FUNCTION_SECRET=your_shared_secret
```

> **Note:** Heavy processing (contact/conversation upsert, AI agent, Twilio
> send) now runs entirely inside the Supabase Edge Function
> (`supabase/functions/process-message/index.ts`), which has a ~150s window —
> not in the Next.js webhook, where Vercel's 10s cap would kill the pipeline.
> The Edge Function secret must be set on the deployed function too:
> ```bash
> supabase secrets set EDGE_FUNCTION_SECRET=your_shared_secret
> ```

### 3. Start Workers
```bash
# Option 1: Start via API (recommended for production)
npm run workers:start

# Option 2: Run standalone (for development)
npm run workers
```

### 4. Test Webhook
```bash
# Check webhook health
curl https://yourdomain.com/api/webhook/twilio

# Check worker status
curl http://localhost:3000/api/workers/start
```

## Monitoring

### Queue Statistics
```bash
curl http://localhost:3000/api/workers/start
```

Response includes:
- pending: Messages waiting to be processed
- processing: Messages currently being processed
- dlq: Messages in dead letter queue

### Logs
- All webhook events logged with timestamps
- Processing times tracked
- Errors logged with full context

## Security Considerations

1. **Always verify webhook signatures** - Prevents fake requests
2. **Use HTTPS in production** - Encrypts webhook data
3. **Rate limit client IPs** - Prevents abuse
4. **Sanitize message content** - Prevents XSS in dashboard

## Troubleshooting

### Webhook not receiving messages
1. Check Twilio configuration
2. Verify webhook URL is accessible
3. Check signature verification
4. Review server logs

### Messages not processing
1. Check if workers are running
2. Verify Redis connection
3. Check queue stats
4. Review error logs

### Duplicate messages
1. Check idempotency table
2. Verify MessageSid uniqueness
3. Review webhook retry logic

## Production Deployment

For production deployment:
1. Use a dedicated worker process
2. Implement health checks
3. Set up monitoring alerts
4. Configure log aggregation
5. Use Redis clustering for scale

## Testing

Use ngrok for local testing:
```bash
ngrok http 3000
# Configure Twilio webhook with ngrok URL
```
