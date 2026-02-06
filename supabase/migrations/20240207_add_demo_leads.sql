-- Demo Leads Table
-- Captures leads from the public demo bot

CREATE TABLE IF NOT EXISTS demo_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    source TEXT DEFAULT 'whatsapp_demo',
    interested BOOLEAN,
    message_count INTEGER DEFAULT 0,
    conversation_summary TEXT,
    industry TEXT DEFAULT 'real_estate',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    contacted BOOLEAN DEFAULT FALSE,
    contacted_at TIMESTAMPTZ,
    contacted_by UUID REFERENCES users(id),
    notes TEXT,
    converted BOOLEAN DEFAULT FALSE,
    converted_to_tenant_id UUID REFERENCES tenants(id)
);

-- Index for querying leads
CREATE INDEX IF NOT EXISTS idx_demo_leads_created 
ON demo_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_leads_interested 
ON demo_leads(interested, contacted);

CREATE INDEX IF NOT EXISTS idx_demo_leads_phone 
ON demo_leads(phone_number);

-- Add comment
COMMENT ON TABLE demo_leads IS 'Leads captured from the public WhatsApp demo bot';
