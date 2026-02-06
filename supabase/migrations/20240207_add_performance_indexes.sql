-- Performance Indexes for Scale
-- Run this migration to optimize database queries

-- Conversations - frequently queried by tenant and status
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status 
ON conversations(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_created 
ON conversations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_contact 
ON conversations(contact_id);

-- Messages - frequently queried by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_direction 
ON messages(tenant_id, direction);

-- Contacts - frequently queried by tenant and phone
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone 
ON contacts(tenant_id, whatsapp_number);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_temperature 
ON contacts(tenant_id, temperature);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_score 
ON contacts(tenant_id, lead_score DESC);

-- Webhook events - for idempotency checks
CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency 
ON webhook_events(source, idempotency_key, tenant_id);

-- Handoff events - for dashboard queries
CREATE INDEX IF NOT EXISTS idx_handoff_events_tenant_status 
ON handoff_events(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_handoff_events_created 
ON handoff_events(created_at DESC);

-- Appointments - for calendar queries
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date 
ON appointments(tenant_id, scheduled_time);

CREATE INDEX IF NOT EXISTS idx_appointments_contact 
ON appointments(contact_id);

-- Usage tracking - for billing queries
CREATE INDEX IF NOT EXISTS idx_conversation_usage_tenant_month 
ON conversation_usage(tenant_id, billing_month);

-- Rate limits - for rate limit checks
CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant_phone 
ON rate_limits(tenant_id, whatsapp_number, window_start);

COMMENT ON INDEX idx_conversations_tenant_status IS 'Optimizes dashboard conversation list queries';
COMMENT ON INDEX idx_messages_conversation_created IS 'Optimizes conversation message loading';
COMMENT ON INDEX idx_contacts_tenant_phone IS 'Optimizes contact lookup by phone number';
