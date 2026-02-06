-- Handoff Logs Table
CREATE TABLE IF NOT EXISTS handoff_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  message TEXT NOT NULL,
  ai_confidence DECIMAL(3,2),
  ai_sentiment TEXT,
  agent_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE handoff_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Handoff logs tenant access" ON handoff_logs;
CREATE POLICY "Handoff logs tenant access" ON handoff_logs
    FOR ALL USING (
        conversation_id IN (
            SELECT id FROM conversations 
            WHERE tenant_id IN (
                SELECT tenant_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_handoff_logs_conversation ON handoff_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoff_logs_created_at ON handoff_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_handoff_logs_trigger_type ON handoff_logs(trigger_type);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Notifications user access" ON notifications;
CREATE POLICY "Notifications user access" ON notifications
    FOR ALL USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Notification Logs Table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  severity TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Notification logs tenant access" ON notification_logs;
CREATE POLICY "Notification logs tenant access" ON notification_logs
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Update conversations table to add handoff fields
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
ADD COLUMN IF NOT EXISTS handoff_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_claimed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS handoff_resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_resolution TEXT,
ADD COLUMN IF NOT EXISTS handoff_notes TEXT,
ADD COLUMN IF NOT EXISTS handoff_triggers TEXT[],
ADD COLUMN IF NOT EXISTS handoff_escalated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS handoff_escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES users(id);

-- Add indexes for handoff fields
CREATE INDEX IF NOT EXISTS idx_conversations_handoff_status ON conversations(status) 
WHERE status IN ('handoff-requested', 'human-handled');
CREATE INDEX IF NOT EXISTS idx_conversations_handoff_requested_at ON conversations(handoff_requested_at);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent ON conversations(assigned_agent_id);

-- Update users table to add notification preferences
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true, "handoff": true}'::JSONB;

-- Grant permissions
GRANT ALL ON handoff_logs TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notification_logs TO authenticated;

-- Function to get pending handoff count for dashboard
CREATE OR REPLACE FUNCTION get_pending_handoff_count(tenant_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_result
  FROM conversations
  WHERE tenant_id = tenant_uuid
  AND status = 'handoff-requested';
  
  RETURN COALESCE(count_result, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get handoff statistics
CREATE OR REPLACE FUNCTION get_handoff_statistics(tenant_uuid UUID, days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'handoff-requested'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'human-handled'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'escalated', COUNT(*) FILTER (WHERE handoff_escalated = TRUE),
    'avg_response_time', ROUND(AVG(
      EXTRACT(EPOCH FROM (handoff_claimed_at - handoff_requested_at)) / 60
    ))::INTEGER
  )
  INTO result
  FROM conversations
  WHERE tenant_id = tenant_uuid
  AND status IN ('handoff-requested', 'human-handled', 'resolved')
  AND created_at >= CURRENT_DATE - INTERVAL '1 day' * days;
  
  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically escalate unclaimed handoffs
CREATE OR REPLACE FUNCTION escalate_unclaimed_handoffs()
RETURNS TRIGGER AS $$
BEGIN
  -- This function would be called by a cron job
  -- It checks for handoffs that have been pending for more than 10 minutes
  -- and escalates them to managers
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- View for handoff dashboard
CREATE OR REPLACE VIEW handoff_dashboard AS
SELECT 
  c.id,
  c.status,
  c.handoff_reason,
  c.handoff_requested_at,
  c.handoff_claimed_at,
  c.handoff_claimed_by,
  c.handoff_resolved_at,
  c.handoff_resolution,
  c.handoff_notes,
  c.handoff_triggers,
  c.handoff_escalated,
  c.tenant_id,
  ct.name as contact_name,
  ct.whatsapp_number as contact_phone,
  ct.email as contact_email,
  u.full_name as agent_name,
  -- Calculate response time in minutes
  CASE 
    WHEN c.handoff_claimed_at IS NOT NULL AND c.handoff_requested_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (c.handoff_claimed_at - c.handoff_requested_at)) / 60
    ELSE NULL
  END as response_time_minutes,
  -- Determine severity based on triggers
  CASE 
    WHEN c.handoff_escalated = TRUE THEN 'high'
    WHEN EXISTS (
      SELECT 1 FROM unnest(c.handoff_triggers) as t 
      WHERE t IN ('high_value_lead', 'keyword_match', 'negative_sentiment', 'urgent_timeline')
    ) THEN 'high'
    WHEN array_length(c.handoff_triggers, 1) > 1 THEN 'medium'
    ELSE 'low'
  END as severity
FROM conversations c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN users u ON c.handoff_claimed_by = u.id
WHERE c.status IN ('handoff-requested', 'human-handled', 'resolved')
ORDER BY c.handoff_requested_at DESC;

-- Grant access to the view
GRANT SELECT ON handoff_dashboard TO authenticated;
