# Real-time Conversation Viewer

This document explains the real-time conversation viewer for monitoring and managing customer interactions.

## Overview

The conversation viewer provides a comprehensive interface for viewing and managing customer conversations in real-time. It features a three-panel layout with contact information, message thread, and AI insights.

## Layout Structure

### 1. Left Panel (30%) - Contact Information

#### Contact Card
- **Avatar**: Placeholder with initials
- **Name and Phone**: Primary contact details
- **Email**: Secondary contact information (if available)

#### Lead Metrics
- **Lead Score**: Visual progress bar (0-100)
  - Red: 0-39 (Low score)
  - Yellow: 40-69 (Medium score)
  - Green: 70-100 (High score)
- **Temperature Badge**: Color-coded status
  - Gray: New
  - Yellow: Warm
  - Red: Hot
  - Blue: Cold
  - Green: Booked

#### Qualification Details
- Timeline (urgency)
- Budget range
- Service interest
- Current status

#### Appointment Information
- Scheduled time
- Meeting link (if available)
- Status indicator

#### Quick Actions
- **Take Over**: Assign conversation to current user
- **Add Note**: Internal notes for the contact
- **Handoff**: Transfer to another agent

### 2. Center Panel (50%) - Message Thread

#### Message Display
- **WhatsApp-style UI**: Familiar chat interface
- **Color-coded messages**:
  - White (left): Customer messages
  - Blue (right): AI responses
  - Green (right): Human agent responses
- **Timestamps**: Message time display
- **Sender indicators**: Icons for AI/human messages

#### Special Features
- **AI Confidence**: Hover to see confidence score
- **Handoff Triggers**: Highlighted when detected
- **Auto-scroll**: New messages auto-scroll into view
- **Real-time Updates**: Live via WebSocket

#### Message Input (Human Mode)
- Text input field
- Send button
- Enter key support
- Disabled when empty

### 3. Right Panel (20%) - Insights and Tools

#### AI Insights
- **Sentiment Analysis**: Detect customer emotions
- **Intent Detection**: Understand customer needs
- **Risk Alerts**: Identify potential issues
- **Opportunities**: Highlight conversion signals

#### Suggested Responses (Human Mode)
- Context-aware suggestions
- Based on conversation history
- One-click insertion
- Up to 3 suggestions

#### Qualification Checklist
- Email provided ✓
- Budget discussed ✓
- Timeline established ✓
- Appointment booked ✓

#### Timeline Events
- Conversation start
- Message exchanges
- Handoff triggers
- Appointment bookings
- Status changes

## Real-time Features

### WebSocket Connection
- Automatic connection on page load
- Live message updates
- Conversation status changes
- Agent assignment notifications

### Subscription Events
- `INSERT` on messages table
- `UPDATE` on conversations table
- Filtered by conversation ID

### Performance Optimizations
- Unsubscribe on component unmount
- Batch updates for multiple messages
- Efficient DOM updates

## AI Integration

### Insight Generation
1. **Sentiment Analysis**
   - Scans last 5 messages
   - Detects negative keywords
   - 85% confidence threshold

2. **Intent Detection**
   - Pricing inquiries
   - Urgency signals
   - Booking requests

3. **Risk Assessment**
   - Frustration indicators
   - Complaint patterns
   - Churn probability

### Response Suggestions
- Natural language processing
- Contextual relevance
- Multiple options
- Learning from history

## Human Agent Features

### Take Over Mode
- Assign conversation to self
- Disable AI responses
- Enable manual input
- Show suggested responses

### Note System
- Timestamped entries
- Persistent storage
- Internal only
- Rich text support (future)

### Handoff Process
- Trigger detection
- Agent selection
- Context preservation
- Smooth transition

## Technical Implementation

### Dependencies
- Supabase: Real-time database
- React Hooks: State management
- Lucide React: Icons
- Tailwind CSS: Styling

### State Management
```typescript
const [contact, setContact] = useState<Contact | null>(null);
const [messages, setMessages] = useState<Message[]>([]);
const [isHumanMode, setIsHumanMode] = useState(false);
const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
```

### Real-time Subscription
```typescript
supabase
  .channel(`conversation-${conversationId}`)
  .on('postgres_changes', { event: 'INSERT', table: 'messages' }, handleNewMessage)
  .subscribe();
```

## Best Practices

### For Agents
1. **Monitor Insights**: Pay attention to AI alerts
2. **Use Suggestions**: Leverage AI recommendations
3. **Update Notes**: Document important details
4. **Qualify Leads**: Complete checklist items

### For Managers
1. **Review Handoffs**: Ensure smooth transitions
2. **Track Response Times**: Monitor SLA compliance
3. **Analyze Patterns**: Identify common issues
4. **Train AI**: Provide feedback on insights

### For Developers
1. **Optimize Queries**: Use efficient data fetching
2. **Handle Errors**: Graceful degradation
3. **Test Real-time**: Verify WebSocket connections
4. **Monitor Performance**: Track subscription health

## Troubleshooting

### Common Issues
1. **Messages not updating**: Check WebSocket connection
2. **Can't send messages**: Verify human mode is active
3. **Missing insights**: Refresh the page
4. **Handoff not working**: Check permissions

### Debug Mode
Enable console logging:
```javascript
localStorage.setItem('debug', 'conversation:*');
```

### Performance Tips
1. Limit message history (last 100 messages)
2. Implement virtual scrolling for long conversations
3. Cache frequently accessed data
4. Use debounced input for typing indicators

## Future Enhancements

### Planned Features
1. **Typing Indicators**: Show when customer is typing
2. **Message Reactions**: Emoji responses
3. **File Attachments**: Image/document sharing
4. **Voice Notes**: Audio message support
5. **Multi-language**: Auto-translation

### Advanced AI
1. **Predictive Responses**: Anticipate customer needs
2. **Sentiment Trends**: Track mood changes
3. **Conversion Probability**: Real-time scoring
4. **Agent Performance**: AI coaching

### Integration Opportunities
1. **CRM Sync**: Update external systems
2. **Calendar Integration**: Schedule directly
3. **Payment Processing**: Collect deposits
4. **Analytics Dashboard**: Track metrics

## Security Considerations

### Data Protection
- End-to-end encryption
- Access control by role
- Audit logging
- Data retention policies

### Privacy Features
- Message redaction
- Anonymous mode
- Data export for GDPR
- Right to deletion

## Mobile Support

### Responsive Design
- Adapts to screen size
- Touch-friendly interface
- Optimized scrolling
- Mobile keyboard support

### PWA Features
- Offline message queue
- Push notifications
- Home screen icon
- Full-screen mode
