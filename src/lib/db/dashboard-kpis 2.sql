-- Dashboard KPIs View
-- This view provides aggregated metrics for the dashboard

CREATE OR REPLACE VIEW dashboard_kpis AS
SELECT 
  t.id as tenant_id,
  
  -- Total conversations this month
  (SELECT COUNT(*) 
   FROM conversations c 
   WHERE c.tenant_id = t.id 
   AND c.created_at >= date_trunc('month', CURRENT_DATE)) as total_conversations,
  
  -- Conversations change from last month
  (SELECT COUNT(*) 
   FROM conversations c 
   WHERE c.tenant_id = t.id 
   AND c.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
   AND c.created_at < date_trunc('month', CURRENT_DATE)) as conversations_last_month,
  
  -- Active leads (contacts with recent activity)
  (SELECT COUNT(DISTINCT c.contact_id)
   FROM conversations c
   WHERE c.tenant_id = t.id
   AND c.created_at >= CURRENT_DATE - INTERVAL '7 days') as active_leads,
  
  -- Leads change from last week
  (SELECT COUNT(DISTINCT c.contact_id)
   FROM conversations c
   WHERE c.tenant_id = t.id
   AND c.created_at >= CURRENT_DATE - INTERVAL '14 days'
   AND c.created_at < CURRENT_DATE - INTERVAL '7 days') as leads_last_week,
  
  -- Booked appointments this month
  (SELECT COUNT(*)
   FROM appointments a
   WHERE a.tenant_id = t.id
   AND a.created_at >= date_trunc('month', CURRENT_DATE)
   AND a.status = 'scheduled') as booked_appointments,
  
  -- Appointments change from last month
  (SELECT COUNT(*)
   FROM appointments a
   WHERE a.tenant_id = t.id
   AND a.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
   AND a.created_at < date_trunc('month', CURRENT_DATE)
   AND a.status = 'scheduled') as appointments_last_month,
  
  -- Calculate changes
  CASE 
    WHEN (SELECT COUNT(*) FROM conversations c WHERE c.tenant_id = t.id 
          AND c.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND c.created_at < date_trunc('month', CURRENT_DATE)) = 0 
    THEN 0
    ELSE ROUND(
      ((SELECT COUNT(*) FROM conversations c 
        WHERE c.tenant_id = t.id 
        AND c.created_at >= date_trunc('month', CURRENT_DATE))::float /
       (SELECT COUNT(*) FROM conversations c 
        WHERE c.tenant_id = t.id 
        AND c.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        AND c.created_at < date_trunc('month', CURRENT_DATE))::float - 1) * 100
    )
  END as conversations_change,
  
  CASE 
    WHEN (SELECT COUNT(DISTINCT c.contact_id) FROM conversations c
          WHERE c.tenant_id = t.id
          AND c.created_at >= CURRENT_DATE - INTERVAL '14 days'
          AND c.created_at < CURRENT_DATE - INTERVAL '7 days') = 0
    THEN 0
    ELSE ROUND(
      ((SELECT COUNT(DISTINCT c.contact_id) FROM conversations c
        WHERE c.tenant_id = t.id
        AND c.created_at >= CURRENT_DATE - INTERVAL '7 days')::float /
       (SELECT COUNT(DISTINCT c.contact_id) FROM conversations c
        WHERE c.tenant_id = t.id
        AND c.created_at >= CURRENT_DATE - INTERVAL '14 days'
        AND c.created_at < CURRENT_DATE - INTERVAL '7 days')::float - 1) * 100
    )
  END as leads_change,
  
  CASE 
    WHEN (SELECT COUNT(*) FROM appointments a
          WHERE a.tenant_id = t.id
          AND a.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND a.created_at < date_trunc('month', CURRENT_DATE)
          AND a.status = 'scheduled') = 0
    THEN 0
    ELSE ROUND(
      ((SELECT COUNT(*) FROM appointments a
        WHERE a.tenant_id = t.id
        AND a.created_at >= date_trunc('month', CURRENT_DATE)
        AND a.status = 'scheduled')::float /
       (SELECT COUNT(*) FROM appointments a
        WHERE a.tenant_id = t.id
        AND a.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        AND a.created_at < date_trunc('month', CURRENT_DATE)
        AND a.status = 'scheduled')::float - 1) * 100
    )
  END as appointments_change,
  
  -- Conversion rate (appointments / conversations)
  CASE 
    WHEN (SELECT COUNT(*) FROM conversations c 
          WHERE c.tenant_id = t.id 
          AND c.created_at >= date_trunc('month', CURRENT_DATE)) = 0
    THEN 0
    ELSE ROUND(
      (SELECT COUNT(*) FROM appointments a
       WHERE a.tenant_id = t.id
       AND a.created_at >= date_trunc('month', CURRENT_DATE)
       AND a.status = 'scheduled')::float /
      (SELECT COUNT(*) FROM conversations c 
       WHERE c.tenant_id = t.id 
       AND c.created_at >= date_trunc('month', CURRENT_DATE))::float * 100
    )
  END as conversion_rate,
  
  -- Conversion rate change
  0 as conversion_change -- Placeholder for future calculation

FROM tenants t;

-- Hourly stats table for performance tracking
CREATE TABLE IF NOT EXISTS hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL, -- 0-23
  conversation_count INTEGER DEFAULT 0,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, hour, date)
);

-- Enable RLS
ALTER TABLE hourly_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Hourly stats tenant access" ON hourly_stats
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hourly_stats_tenant_date ON hourly_stats(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour ON hourly_stats(hour);

-- Grant permissions
GRANT ALL ON hourly_stats TO authenticated;
GRANT SELECT ON dashboard_kpis TO authenticated;

-- Function to update hourly stats
CREATE OR REPLACE FUNCTION update_hourly_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO hourly_stats (tenant_id, hour, conversation_count, date)
  VALUES (
    NEW.tenant_id,
    EXTRACT(HOUR FROM NEW.created_at)::INTEGER,
    1,
    NEW.created_at::DATE
  )
  ON CONFLICT (tenant_id, hour, date)
  DO UPDATE SET
    conversation_count = hourly_stats.conversation_count + 1,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update hourly stats on new conversation
DROP TRIGGER IF EXISTS on_conversation_create ON conversations;
CREATE TRIGGER on_conversation_create
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_hourly_stats();
