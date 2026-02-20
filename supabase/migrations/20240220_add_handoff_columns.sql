-- Add missing handoff columns to conversations table
-- These are referenced in the handoff system but were missing from the base schema

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_requested_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_claimed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_claimed_by UUID REFERENCES users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_resolved_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_triggers TEXT[] DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_escalated BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_agent_id UUID REFERENCES users(id);

-- Index for handoff queries
CREATE INDEX IF NOT EXISTS idx_conversations_handoff_status 
  ON conversations(tenant_id, status) 
  WHERE status IN ('handoff-requested', 'human-handling');

CREATE INDEX IF NOT EXISTS idx_conversations_handoff_requested_at
  ON conversations(handoff_requested_at DESC)
  WHERE handoff_requested_at IS NOT NULL;
