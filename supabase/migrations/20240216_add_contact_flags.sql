-- Add needs_human and needs_followup flags to contacts table
-- These are set by the AI via update_lead tool to trigger human handoff or follow-up

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS needs_human BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS needs_followup BOOLEAN DEFAULT false;

-- Track when the stale conversation checker last sent a nudge
-- Prevents sending multiple stale nudges to the same conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stale_nudge_sent_at TIMESTAMPTZ;

-- Index for efficient stale conversation queries
CREATE INDEX IF NOT EXISTS idx_conversations_stale
  ON conversations(status, is_active, updated_at)
  WHERE is_active = true AND status = 'active';

-- Index for needs_human flag (dashboard filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_needs_human
  ON contacts(tenant_id, needs_human)
  WHERE needs_human = true;
