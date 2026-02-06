-- Onboarding System Migration
-- Tracks client onboarding progress and stores setup data

-- Add onboarding fields to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMP WITH TIME ZONE;

-- Business profile fields (if not already present)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS products_services TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- AI configuration fields
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_personality TEXT DEFAULT 'professional';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_language TEXT DEFAULT 'en';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_greeting TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_fallback_message TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS qualification_questions JSONB DEFAULT '[]';

-- Create onboarding_logs table for tracking progress
CREATE TABLE IF NOT EXISTS onboarding_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  data JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_logs_tenant ON onboarding_logs(tenant_id);

-- Comments
COMMENT ON COLUMN tenants.onboarding_step IS 'Current step in onboarding wizard (0-5)';
COMMENT ON COLUMN tenants.onboarding_data IS 'Temporary data collected during onboarding';
COMMENT ON COLUMN tenants.ai_personality IS 'AI tone: professional, friendly, casual';
COMMENT ON COLUMN tenants.qualification_questions IS 'Custom lead qualification questions';
