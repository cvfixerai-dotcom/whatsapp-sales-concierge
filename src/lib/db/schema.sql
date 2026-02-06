-- SalesConcierge AI - Multi-tenant Database Schema
-- PostgreSQL with Supabase extensions

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table - Multi-tenant organization data
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    subscription_tier TEXT NOT NULL CHECK (subscription_tier IN ('starter', 'growth', 'scale', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'past_due')),
    stripe_customer_id TEXT,
    twilio_account_sid TEXT,
    twilio_auth_token TEXT, -- Store encrypted
    twilio_whatsapp_number TEXT,
    calendly_api_key TEXT, -- Store encrypted
    calendly_event_url TEXT,
    industry TEXT CHECK (industry IN ('real-estate', 'automotive', 'home-services', 'medical', 'other')),
    language TEXT[] DEFAULT ARRAY['en', 'ar'],
    business_hours JSONB DEFAULT '{}',
    services JSONB DEFAULT '[]',
    faqs JSONB DEFAULT '[]',
    ai_provider TEXT DEFAULT 'anthropic' CHECK (ai_provider IN ('anthropic', 'openai')),
    ai_model TEXT DEFAULT 'claude-3-sonnet-20240229',
    monthly_conversation_limit INTEGER NOT NULL DEFAULT 500,
    setup_completed BOOLEAN DEFAULT false,
    setup_fee_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table - Authentication and user management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
    full_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true}',
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts table - Lead management
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL,
    name TEXT,
    email TEXT,
    language TEXT DEFAULT 'en',
    temperature TEXT DEFAULT 'new' CHECK (temperature IN ('new', 'warm', 'hot', 'cold', 'booked', 'lost')),
    lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
    qualification_status TEXT DEFAULT 'unqualified' CHECK (qualification_status IN ('unqualified', 'qualified', 'contacted', 'converted')),
    timeline TEXT CHECK (timeline IN ('urgent', 'this-week', 'this-month', 'exploring', 'not-specified')),
    budget_range TEXT,
    service_interest TEXT,
    source TEXT DEFAULT 'organic' CHECK (source IN ('organic', 'referral', 'paid', 'direct', 'other')),
    assigned_to UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, whatsapp_number)
);

-- Conversations table - Conversation tracking with 24-hour windows
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conversation_window_end TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'handoff-requested', 'human-handling', 'closed')),
    handoff_reason TEXT,
    handled_by UUID REFERENCES users(id),
    ai_confidence_avg DECIMAL(3,2) CHECK (ai_confidence_avg >= 0 AND ai_confidence_avg <= 100),
    summary TEXT,
    key_insights JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table - Individual message storage
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'ai', 'human')),
    sender_id UUID, -- user_id if human
    content TEXT NOT NULL,
    language TEXT,
    twilio_message_sid TEXT UNIQUE,
    ai_confidence DECIMAL(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
    ai_intent TEXT,
    ai_sentiment TEXT,
    requires_handoff BOOLEAN DEFAULT false,
    handoff_reason TEXT,
    metadata JSONB DEFAULT '{}', -- media URLs, quick replies, etc
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments table - Booked meetings
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    calendly_event_id TEXT UNIQUE,
    scheduled_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    meeting_link TEXT,
    meeting_type TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')),
    reminder_sent BOOLEAN DEFAULT false,
    reminder_count INTEGER DEFAULT 0,
    notes TEXT,
    calendar_synced BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Prompts table - Customizable AI prompts
CREATE TABLE ai_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for default prompts
    name TEXT NOT NULL,
    industry TEXT,
    language TEXT DEFAULT 'en',
    prompt_type TEXT NOT NULL CHECK (prompt_type IN ('system', 'qualification', 'booking', 'followup', 'handoff', 'custom')),
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook Events table - Reliable webhook processing
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    idempotency_key UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    source TEXT NOT NULL CHECK (source IN ('twilio', 'calendly', 'stripe')),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Usage table - Billing and usage tracking
CREATE TABLE conversation_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    billing_month DATE NOT NULL,
    conversation_count INTEGER DEFAULT 0,
    overage_count INTEGER DEFAULT 0,
    overage_rate DECIMAL(10,2) DEFAULT 0.50,
    amount_due DECIMAL(10,2) DEFAULT 0,
    stripe_invoice_id TEXT,
    paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, billing_month)
);

-- Rate Limits table - WhatsApp rate limiting
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    window_duration_seconds INTEGER DEFAULT 1, -- 1 second window
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, whatsapp_number, window_start)
);

-- Audit Log table - Track important changes
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    table_name TEXT,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX idx_contacts_tenant_temp ON contacts(tenant_id, temperature);
CREATE INDEX idx_contacts_tenant_assigned ON contacts(tenant_id, assigned_to);
CREATE INDEX idx_contacts_whatsapp ON contacts(whatsapp_number);
CREATE INDEX idx_conversations_tenant_active ON conversations(tenant_id, is_active);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_window ON conversations(conversation_window_start);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_twilio_sid ON messages(twilio_message_sid);
CREATE INDEX idx_appointments_tenant_time ON appointments(tenant_id, scheduled_time);
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_ai_prompts_tenant_type ON ai_prompts(tenant_id, prompt_type);
CREATE INDEX idx_webhooks_unprocessed ON webhook_events(processed, created_at) WHERE NOT processed;
CREATE INDEX idx_webhooks_retry ON webhook_events(next_retry_at) WHERE NOT processed AND retry_count < max_retries;
CREATE INDEX idx_usage_tenant_month ON conversation_usage(tenant_id, billing_month);
CREATE INDEX idx_rate_limits_window ON rate_limits(tenant_id, window_start);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at);

-- Row Level Security (RLS)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Tenants - Only accessible by their own users
CREATE POLICY "Tenant access" ON tenants
    FOR ALL USING (
        id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Users - Users can see all users in their tenant
CREATE POLICY "Users tenant access" ON users
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Contacts - Tenant-scoped access
CREATE POLICY "Contacts tenant access" ON contacts
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Conversations - Tenant-scoped access
CREATE POLICY "Conversations tenant access" ON conversations
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Messages - Tenant-scoped access
CREATE POLICY "Messages tenant access" ON messages
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Appointments - Tenant-scoped access
CREATE POLICY "Appointments tenant access" ON appointments
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- AI Prompts - Default prompts visible to all, custom prompts tenant-scoped
CREATE POLICY "AI prompts access" ON ai_prompts
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Webhook Events - Tenant-scoped access
CREATE POLICY "Webhook events tenant access" ON webhook_events
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Conversation Usage - Tenant-scoped access
CREATE POLICY "Conversation usage tenant access" ON conversation_usage
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Rate Limits - Tenant-scoped access
CREATE POLICY "Rate limits tenant access" ON rate_limits
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Audit Logs - Tenant-scoped access
CREATE POLICY "Audit logs tenant access" ON audit_logs
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Functions and Triggers
-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_prompts_updated_at BEFORE UPDATE ON ai_prompts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_usage_updated_at BEFORE UPDATE ON conversation_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to close conversation windows after 24 hours
CREATE OR REPLACE FUNCTION close_conversation_windows()
RETURNS void AS $$
BEGIN
    UPDATE conversations
    SET 
        conversation_window_end = NOW(),
        is_active = false,
        status = 'closed'
    WHERE 
        is_active = true
        AND conversation_window_start < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to increment conversation count
CREATE OR REPLACE FUNCTION increment_conversation_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1
    WHERE id = NEW.conversation_id;
    
    -- Update contact's last message time
    UPDATE contacts
    SET last_message_at = NEW.created_at
    WHERE id = (
        SELECT contact_id FROM conversations WHERE id = NEW.conversation_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_message_count AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION increment_conversation_count();

-- Function to track conversation usage
CREATE OR REPLACE FUNCTION track_conversation_usage()
RETURNS TRIGGER AS $$
DECLARE
    billing_month DATE;
    usage_record RECORD;
BEGIN
    billing_month := DATE_TRUNC('month', NEW.conversation_window_start);
    
    -- Check if usage record exists for this month
    SELECT * INTO usage_record
    FROM conversation_usage
    WHERE tenant_id = NEW.tenant_id AND billing_month = billing_month;
    
    IF NOT FOUND THEN
        INSERT INTO conversation_usage (tenant_id, billing_month, conversation_count)
        VALUES (NEW.tenant_id, billing_month, 1);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_conversation_usage_trigger AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION track_conversation_usage();

-- Function to log audit changes
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, new_values)
        VALUES (
            COALESCE(NEW.tenant_id, (SELECT tenant_id FROM users WHERE id = auth.uid())),
            auth.uid(),
            'INSERT',
            TG_TABLE_NAME,
            NEW.id,
            row_to_json(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_values, new_values)
        VALUES (
            COALESCE(NEW.tenant_id, OLD.tenant_id, (SELECT tenant_id FROM users WHERE id = auth.uid())),
            auth.uid(),
            'UPDATE',
            TG_TABLE_NAME,
            NEW.id,
            row_to_json(OLD),
            row_to_json(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_values)
        VALUES (
            OLD.tenant_id,
            auth.uid(),
            'DELETE',
            TG_TABLE_NAME,
            OLD.id,
            row_to_json(OLD)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to important tables
CREATE TRIGGER audit_tenants AFTER INSERT OR UPDATE OR DELETE ON tenants
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Insert default AI prompts
INSERT INTO ai_prompts (name, prompt_type, industry, language, content, description) VALUES
('System Prompt - Default', 'system', NULL, 'en', 
'You are SalesConcierge AI, a professional sales assistant for {{company_name}}. 
Your goal is to qualify leads and book appointments. 
Be friendly, professional, and concise. 
Always respond in the same language as the customer.
Available services: {{services}}
Business hours: {{business_hours}}
Qualification criteria: {{qualification_criteria}}',
'Default system prompt for all tenants'),

('Qualification Prompt - Default', 'qualification', NULL, 'en',
'Analyze the customer message and determine:
1. Their interest level (0-100)
2. Qualification status (unqualified/qualified/contacted)
3. Timeline (urgent/this-week/this-month/exploring)
4. Next action required

Respond with a JSON object containing these fields.',
'Prompt for lead qualification'),

('Booking Prompt - Default', 'booking', NULL, 'en',
'If the customer is qualified and wants to book, offer available appointment slots.
Use the Calendly integration to show real-time availability.
Confirm the booking details and send a calendar invitation.',
'Prompt for appointment booking');

-- Create a function to encrypt sensitive data
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(pgp_sym_encrypt(data, current_setting('app.encryption_key', true)), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to decrypt sensitive data
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(decode(encrypted_data, 'base64'), current_setting('app.encryption_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create views for common queries
CREATE VIEW conversation_summary AS
SELECT 
    c.id,
    c.tenant_id,
    c.contact_id,
    ct.name as contact_name,
    ct.whatsapp_number,
    ct.temperature,
    ct.lead_score,
    c.message_count,
    c.status,
    c.created_at as conversation_start,
    MAX(m.created_at) as last_message_at
FROM conversations c
JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, ct.name, ct.whatsapp_number, ct.temperature, ct.lead_score;

CREATE VIEW tenant_usage_stats AS
SELECT 
    t.id as tenant_id,
    t.company_name,
    t.subscription_tier,
    t.monthly_conversation_limit,
    COALESCE(cu.conversation_count, 0) as current_month_conversations,
    COALESCE(cu.conversation_count, 0) - t.monthly_conversation_limit as overage,
    CASE 
        WHEN COALESCE(cu.conversation_count, 0) > t.monthly_conversation_limit THEN true 
        ELSE false 
    END as is_over_limit
FROM tenants t
LEFT JOIN conversation_usage cu ON t.id = cu.tenant_id 
    AND cu.billing_month = DATE_TRUNC('month', CURRENT_DATE);

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
