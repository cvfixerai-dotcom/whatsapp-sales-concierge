# Human Handoff System

This document explains the comprehensive human handoff system for SalesConcierge AI.

## Overview

The handoff system intelligently detects when a customer conversation needs human intervention and seamlessly transfers the conversation to available agents. It includes trigger detection, notifications, escalation, and a management dashboard.

## Architecture

### Components
1. **Detector** (`/lib/handoff/detector.ts`)
   - Analyzes messages and AI responses
   - Identifies handoff triggers
   - Calculates severity levels
   - Logs trigger events

2. **Notifier** (`/lib/handoff/notifier.ts`)
   - Sends notifications to agents
   - Handles escalation logic
   - Manages claim/resolution workflow
   - Tracks response times

3. **Dashboard** (`/app/dashboard/handoffs/page.tsx`)
   - Lists all handoff requests
   - Provides filtering and search
   - Enables claim/resolve actions
   - Shows statistics

## Handoff Triggers

### 1. Low AI Confidence
- **Condition**: AI confidence < 70%
- **Severity**: Medium
- **Rationale**: AI is uncertain about response

### 2. High-Value Lead
- **Condition**: Lead score > 80 AND high budget
- **Severity**: High
- **Rationale**: Important customer needs human touch

### 3. Urgent Timeline
- **Condition**: Urgent timeline AND qualified lead
- **Severity**: High
- **Rationale**: Time-sensitive opportunity

### 4. Keyword Detection
- **Keywords**: "human", "agent", "complaint", "escalate", etc.
- **Languages**: English and Arabic
- **Severity**: High
- **Rationale**: Customer explicitly requests human

### 5. Repeated Questions
- **Condition**: Same topic asked 3+ times
- **Severity**: Medium
- **Rationale**: AI unable to satisfy customer

### 6. Negative Sentiment
- **Condition**: Negative or frustrated sentiment
- **Severity**: High
- **Rationale**: Customer dissatisfaction risk

### 7. Complex Query
- **Condition**: Complex comparison questions
- **Severity**: Medium
- **Rationale**: Requires nuanced understanding

### 8. Rapid Fire Messages
- **Condition**: 3+ messages in 5 minutes
- **Severity**: Medium
- **Rationale**: Customer anxiety or urgency

## Severity Levels

### High (Immediate Handoff)
- Customer explicitly requests human
- Negative sentiment detected
- High-value lead at risk
- Urgent timeline

### Medium (Monitor Consideration)
- Low AI confidence
- Repeated questions
- Complex queries
- Rapid messaging

### Low (Informational)
- Long messages
- General uncertainty

## Notification System

### Agent Notifications
1. **Email**
   - Detailed handoff information
   - Direct link to conversation
   - Severity indicators

2. **SMS** (High Severity Only)
   - Immediate alert for urgent cases
   - Short, actionable message

3. **In-App**
   - Real-time notification
   - Clickable to open conversation
   - Priority-based display

### Escalation Process
1. **Initial Request**: Notify all available agents
2. **10-Minute Timeout**: If unclaimed, escalate to managers
3. **Manager Alert**: Email + SMS notification
4. **Critical Escalation**: Multiple notification channels

## Dashboard Features

### Statistics Cards
- Total handoffs
- Pending requests
- In-progress conversations
- Resolved handoffs
- Escalated count

### Filtering Options
- Status (pending/in-progress/resolved)
- Severity (low/medium/high)
- Search by contact name/phone/reason

### Actions
- **Claim**: Assign conversation to self
- **View**: Open conversation viewer
- **Resolve**: Mark as resolved or return to AI

### Response Time Tracking
- Average response time calculation
- Individual handoff metrics
- Performance analytics

## Workflow

### 1. Detection
```typescript
const handoffResult = await checkHandoffTriggers(
  message,
  contact,
  aiResponse
);
```

### 2. Notification
```typescript
await notifyHandoffRequest(
  conversationId,
  reason,
  severity,
  triggers
);
```

### 3. Claim
```typescript
await claimHandoff(conversationId, agentId);
```

### 4. Resolution
```typescript
await resolveHandoff(
  conversationId,
  'resolved' | 'returned_to_ai',
  notes
);
```

## API Endpoints

### POST /api/handoffs/claim
Claims a handoff request for the current agent.

**Request:**
```json
{
  "conversationId": "uuid",
  "agentId": "uuid"
}
```

### POST /api/handoffs/resolve
Resolves a handoff request.

**Request:**
```json
{
  "conversationId": "uuid",
  "resolution": "resolved|returned_to_ai",
  "notes": "string"
}
```

## Database Schema

### Tables
1. **handoff_logs**
   - Trigger events logging
   - Severity and confidence tracking
   - Agent assignment history

2. **notifications**
   - In-app notifications
   - Priority levels
   - Read/unread status

3. **notification_logs**
   - Notification delivery tracking
   - Recipient counts
   - Escalation history

### Views
- **handoff_dashboard**: Aggregated handoff data
- Includes calculated fields like response time and severity

## Best Practices

### For Agents
1. **Quick Response**: Claim handoffs within 5 minutes
2. **Review Context**: Check conversation history
3. **Document Resolution**: Add clear notes
4. **Update Temperature**: Adjust lead temperature

### For Managers
1. **Monitor Escalations**: Track unclaimed handoffs
2. **Review Performance**: Analyze response times
3. **Train AI**: Provide feedback on triggers
4. **Optimize Workflows**: Identify patterns

### For Developers
1. **Tune Thresholds**: Adjust confidence levels
2. **Add Keywords**: Update handoff keywords
3. **Monitor Performance**: Track false positives
4. **Test Notifications**: Verify delivery

## Configuration

### Notification Preferences
```json
{
  "email": true,
  "sms": false,
  "push": true,
  "handoff": true
}
```

### Handoff Thresholds
- Confidence threshold: 70%
- Escalation timeout: 10 minutes
- Rapid fire threshold: 3 messages/5 minutes
- Repeated question threshold: 3 mentions

## Monitoring

### Key Metrics
1. **Handoff Rate**: % of conversations requiring human
2. **Response Time**: Average time to claim
3. **Resolution Rate**: % successfully resolved
4. **Escalation Rate**: % requiring manager intervention
5. **False Positives**: Unnecessary handoffs

### Alerts
- High escalation rate
- Long response times
- Agent availability issues
- System failures

## Security

### Access Control
- Role-based permissions
- Tenant isolation
- Audit logging
- Data encryption

### Privacy
- Customer data protection
- Agent privacy controls
- Secure notification channels
- Compliance features

## Troubleshooting

### Common Issues
1. **No Notifications**: Check agent preferences
2. **Delayed Escalations**: Verify cron jobs
3. **False Triggers**: Adjust confidence thresholds
4. **Missing Handoffs**: Check database logs

### Debug Mode
Enable detailed logging:
```typescript
localStorage.setItem('debug', 'handoff:*');
```

## Future Enhancements

### Planned Features
1. **AI Learning**: Improve trigger detection
2. **Agent Ranking**: Smart assignment based on skills
3. **Predictive Handoffs**: Anticipate needs
4. **Multi-language Support**: Expand keyword detection
5. **Integration**: Connect to external CRM systems

### Advanced Analytics
1. **Sentiment Trends**: Track customer satisfaction
2. **Agent Performance**: Individual metrics
3. **Trigger Effectiveness**: Analyze success rates
4. **Cost Analysis**: ROI of human intervention

## Integration Points

### AI System
- Real-time trigger detection
- Confidence scoring
- Sentiment analysis
- Context preservation

### Communication Channels
- WhatsApp integration
- Email notifications
- SMS alerts
- In-app messaging

### CRM Systems
- Contact synchronization
- Activity logging
- Lead scoring updates
- Analytics reporting
