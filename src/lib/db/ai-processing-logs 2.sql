-- AI Processing Logs Table
-- For debugging and monitoring AI processing

CREATE TABLE IF NOT EXISTS ai_processing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_content TEXT NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    ai_response JSONB,
    handoff_detected JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_processing_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "AI logs tenant access" ON ai_processing_logs
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX idx_ai_logs_tenant ON ai_processing_logs(tenant_id, created_at);
CREATE INDEX idx_ai_logs_conversation ON ai_processing_logs(conversation_id);
CREATE INDEX idx_ai_logs_errors ON ai_processing_logs(tenant_id) WHERE error_message IS NOT NULL;

-- Grant permissions
GRANT ALL ON ai_processing_logs TO authenticated;
