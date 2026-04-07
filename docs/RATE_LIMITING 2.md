# WhatsApp Rate Limiting System

This document explains the rate limiting implementation for WhatsApp messages to avoid Twilio blocks and ensure reliable delivery.

## Overview

The system enforces multiple rate limits to comply with WhatsApp Business API requirements and prevent account suspension:

1. **Per-second limit**: 1 message per second per phone number
2. **Daily limit**: 1000 messages per day per Twilio account
3. **Monthly limit**: 30,000 messages per month per Twilio account

## Architecture

```
Message Send Request → Rate Limit Check → If Allowed → Send via Twilio
                                   ↓
                              If Blocked → Requeue with Delay
                                   ↓
                              Redis Cache → Fast Checks
                                   ↓
                              Database → Analytics
```

## Components

### 1. Rate Limiter Service (`/lib/services/rate-limiter.ts`)

- **Redis-based tracking** for fast rate limit checks
- **Sliding window implementation** for accurate rate limiting
- **Automatic requeuing** of rate-limited messages
- **Jitter addition** to prevent thundering herd

### 2. Twilio Service Integration

- Checks rate limits before sending
- Handles Twilio 429 responses
- Records successful sends
- Bypass option for critical messages

### 3. Queue Integration

- Rate-limited messages are requeued automatically
- Exponential backoff for retries
- Dead letter queue for persistent failures

## Rate Limit Logic

### Per-Second Limit
```javascript
// Uses Redis with 1-second TTL
const key = `rate_ps:${tenantId}:${phoneNumber}`;
const count = await redis.incr(key);
await redis.expire(key, 1);

if (count > 1) {
  // Rate limited - requeue with delay
}
```

### Daily Limit
```javascript
// Uses date-based key with 24-hour TTL
const date = new Date().toISOString().slice(0, 10);
const key = `rate_day:${tenantId}:${date}`;
```

### Monthly Limit
```javascript
// Uses month-based key with 30-day TTL
const month = new Date().toISOString().slice(0, 7);
const key = `rate_month:${tenantId}:${month}`;
```

## Handling Rate Limits

When a message is rate limited:

1. **Calculate delay** based on limit type
2. **Add jitter** (up to 1 second) to spread retries
3. **Requeue message** with calculated delay
4. **Log the event** for monitoring

```javascript
const jitter = Math.random() * 1000;
const delay = retryAfter + jitter;

await redisQueue.queueOutboundMessage(tenantId, to, body, {
  delay,
  rateLimited: true,
});
```

## Monitoring

### Check Rate Limit Status
```bash
# Get overall usage for tenant
curl -H "Authorization: Bearer <token>" \
  https://yourapp.com/api/rate-limit/status

# Check specific phone number
curl -H "Authorization: Bearer <token>" \
  "https://yourapp.com/api/rate-limit/status?phone=+1234567890"
```

Response:
```json
{
  "usage": {
    "perSecond": { "used": 0, "limit": 1, "remaining": 1, "percentage": 0 },
    "daily": { "used": 45, "limit": 1000, "remaining": 955, "percentage": 4 },
    "monthly": { "used": 1200, "limit": 30000, "remaining": 28800, "percentage": 4 }
  },
  "specific": {
    "phoneNumber": "+1234567890",
    "allowed": true,
    "limitType": null
  }
}
```

### Reset Rate Limits (Admin Only)
```bash
curl -X DELETE -H "Authorization: Bearer <admin-token>" \
  https://yourapp.com/api/rate-limit/status
```

## Database Schema

The `rate_limits` table stores historical data for analytics:

```sql
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  whatsapp_number TEXT,
  window_start TIMESTAMPTZ,
  message_count INTEGER,
  UNIQUE(tenant_id, whatsapp_number, window_start)
);
```

## Cron Job Setup

Set up a daily cron job to clean old records:

```bash
# Daily at 2 AM
0 2 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://yourapp.com/api/cleanup/rate-limits
```

## Best Practices

### 1. Message Batching
- Don't send multiple messages rapidly
- Use queue system for bulk messages
- Respect rate limits at all times

### 2. Error Handling
- Always check `rateLimited` flag in responses
- Implement exponential backoff
- Log rate limit events

### 3. Monitoring
- Track usage percentages
- Set alerts at 80% capacity
- Monitor queue depth

### 4. Customer Communication
- Inform customers about potential delays
- Set expectations for response times
- Provide alternative contact methods

## Configuration

Rate limits can be adjusted per environment:

```javascript
// In rate-limiter.ts
const config = {
  perSecond: 1,      // WhatsApp limit
  perDay: 1000,      // Conservative daily limit
  perMonth: 30000,   // Conservative monthly limit
};
```

## Troubleshooting

### Messages Not Sending
1. Check rate limit status API
2. Verify Redis connection
3. Check queue depth
4. Review error logs

### Frequent Rate Limiting
1. Check for message loops
2. Verify batching logic
3. Review customer usage patterns
4. Consider increasing limits

### Queue Backlog
1. Monitor queue statistics
2. Check for failed messages
3. Verify worker status
4. Scale workers if needed

## Production Considerations

1. **Redis Clustering**: For high throughput, use Redis cluster
2. **Rate Limit Tiers**: Different limits per subscription tier
3. **Burst Capacity**: Allow short bursts with tokens
4. **Analytics Dashboard**: Visualize usage patterns
5. **Alert System**: Notify on threshold breaches

## Security

1. **Rate Limit Bypass**: Only for system messages
2. **API Protection**: Secure rate limit endpoints
3. **Data Privacy**: Don't log message content
4. **Access Control**: Admin-only reset functions
