-- Migration: AI Name, Trial, Follow-ups, Reminders

-- New tenant columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_assistant_name TEXT DEFAULT 'Sarah';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_display_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_conversation_limit INTEGER DEFAULT 25;

-- Follow-up sequence templates (editable per tenant)
CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  industry TEXT NOT NULL DEFAULT 'real-estate',
  sequence_name TEXT NOT NULL,
  target_temperature TEXT NOT NULL CHECK (target_temperature IN ('warm', 'cold', 'new')),
  day_3_message TEXT NOT NULL,
  day_7_message TEXT NOT NULL,
  day_21_message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled follow-ups per contact
CREATE TABLE IF NOT EXISTS scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES follow_up_sequences(id) ON DELETE SET NULL,
  follow_up_type TEXT NOT NULL CHECK (follow_up_type IN ('day_3', 'day_7', 'day_21')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  message_content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped')),
  sent_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointment reminders tracking
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('2_hours', '30_minutes')),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('lead', 'agent')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  message_content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for CRON performance
CREATE INDEX IF NOT EXISTS idx_followups_pending ON scheduled_followups(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followups_contact ON scheduled_followups(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON appointment_reminders(status, scheduled_for) WHERE status = 'pending';
