# Leads Management System

This document explains the comprehensive leads management system for SalesConcierge AI.

## Overview

The leads management system provides a powerful interface for viewing, filtering, editing, and managing sales leads. It features advanced table capabilities, real-time data, and comprehensive lead details.

## Features

### 1. Advanced Filtering

#### Temperature Filter
- **New**: Recently added contacts
- **Warm**: Engaged but not ready to buy
- **Hot**: High-intent leads ready to convert
- **Cold**: Low engagement or interest
- **Booked**: Successfully converted leads

#### Timeline Filter
- **Urgent**: Immediate need (within 24 hours)
- **This Week**: Need within 7 days
- **This Month**: Need within 30 days
- **Exploring**: Just researching, no immediate need

#### Date Range Filter
Filter leads by creation date range for specific periods.

#### Search
Search across:
- Contact name
- Phone number
- Email address

### 2. Data Table Features

#### Columns
- **Contact**: Name, phone with avatar
- **Email**: Contact email address
- **Lead Score**: Visual progress bar (0-100)
- **Temperature**: Color-coded status badge
- **Timeline**: Purchase timeframe
- **Last Message**: Timestamp of last interaction
- **Actions**: View, edit, and more

#### Table Capabilities
- **Sorting**: Click column headers to sort
- **Pagination**: 20 leads per page
- **Selection**: Multi-select for bulk actions
- **Responsive**: Adapts to screen size

### 3. Lead Detail Modal

#### Contact Information
- Editable fields for name and email
- Visual lead score indicator
- Temperature status selector
- Phone number (read-only)

#### Conversation History
- Full message thread
- Color-coded by sender (contact/AI)
- Timestamps for each message
- Scrollable history

#### Notes Section
- Add and edit internal notes
- Persistent storage
- Rich text support (future)

#### Actions
- **Edit**: Modify lead information
- **Save**: Update changes
- **Handoff**: Transfer to human agent

### 4. Bulk Operations

#### Export Selected
- CSV format
- All lead fields included
- Downloadable file

#### Future Bulk Actions
- Assign to agent
- Change temperature
- Send follow-up messages
- Delete leads

## Technical Implementation

### Dependencies
- **@tanstack/react-table**: Advanced table features
- **Supabase**: Real-time data fetching
- **Lucide React**: Icons
- **Tailwind CSS**: Styling

### Data Flow
1. Initial fetch on component mount
2. Filter changes trigger refetch
3. Real-time updates via Supabase subscriptions
4. Optimistic updates for better UX

### State Management
- React hooks for local state
- TanStack Table for table state
- Supabase client for API calls

## Lead Scoring

### Score Calculation
The lead score (0-100) is calculated based on:
- Has email: +10 points
- Has name: +10 points
- Budget confirmed: +25 points
- Timeline urgency: 5-20 points
- Service interest: +15 points
- Temperature: 0-20 points
- Message count: 5-10 points
- Appointment booked: +20 points

### Score Colors
- **Red (0-39)**: Low score, needs nurturing
- **Yellow (40-69)**: Medium score, potential
- **Green (70-100)**: High score, ready to convert

## Temperature System

### Temperature Definitions
- **New**: First contact, no engagement
- **Warm**: Responding, some interest shown
- **Hot**: High engagement, asking for pricing/demo
- **Cold**: Unresponsive or negative
- **Booked**: Appointment scheduled

### Automatic Updates
- AI updates temperature based on conversation
- Manual override available
- Affects lead scoring

## Best Practices

### For Sales Teams
1. **Hot Leads**: Contact immediately within 1 hour
2. **Warm Leads**: Follow up within 24 hours
3. **Cold Leads**: Add to nurture campaign
4. **New Leads**: Respond within 5 minutes

### Data Quality
1. Always update contact information
2. Add notes after each interaction
3. Keep temperature status current
4. Regularly review and clean data

### Conversion Optimization
1. Focus on leads with score > 70
2. Use timeline to prioritize follow-ups
3. Track conversion rates by temperature
4. A/B test outreach strategies

## API Integration

### Endpoints Used
- `GET /contacts` - Fetch leads with filters
- `PUT /contacts/{id}` - Update lead information
- `GET /conversations` - Fetch message history
- `POST /export` - Export leads data

### Real-time Features
- WebSocket connections for live updates
- Automatic refresh on new messages
- Real-time score updates

## Future Enhancements

### Planned Features
1. **Advanced Analytics**: Conversion funnel tracking
2. **Automation**: Rules-based lead assignment
3. **Integrations**: CRM sync, email campaigns
4. **Mobile App**: Native iOS/Android apps
5. **AI Insights**: Predictive scoring, recommendations

### Performance Improvements
1. **Virtual Scrolling**: For large datasets
2. **Caching**: Reduce API calls
3. **Lazy Loading**: Load data on demand
4. **Background Sync**: Offline support

## Troubleshooting

### Common Issues
1. **Leads not loading**: Check network connection
2. **Filters not working**: Clear browser cache
3. **Save fails**: Check permissions
4. **Export empty**: Verify selection

### Debug Mode
Enable debug mode in browser console:
```javascript
localStorage.setItem('debug', 'leads:*');
```

## Security Considerations

### Data Protection
- All data encrypted in transit
- Role-based access control
- Audit logging for all changes
- GDPR compliance features

### Privacy Features
- Data anonymization options
- Right to deletion
- Export personal data
- Consent management
