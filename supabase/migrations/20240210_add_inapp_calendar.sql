-- ============================================================
-- In-App Calendar System
-- availability_settings: per-tenant weekly schedule + booking rules
-- blocked_slots: holidays, lunch breaks, custom blocks
-- Upgrades appointments table with new fields
-- ============================================================

-- Availability settings (per tenant)
CREATE TABLE IF NOT EXISTS availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Working hours per day (TIME type)
  monday_start TIME DEFAULT '09:00',
  monday_end TIME DEFAULT '17:00',
  monday_enabled BOOLEAN DEFAULT true,

  tuesday_start TIME DEFAULT '09:00',
  tuesday_end TIME DEFAULT '17:00',
  tuesday_enabled BOOLEAN DEFAULT true,

  wednesday_start TIME DEFAULT '09:00',
  wednesday_end TIME DEFAULT '17:00',
  wednesday_enabled BOOLEAN DEFAULT true,

  thursday_start TIME DEFAULT '09:00',
  thursday_end TIME DEFAULT '17:00',
  thursday_enabled BOOLEAN DEFAULT true,

  friday_start TIME DEFAULT '09:00',
  friday_end TIME DEFAULT '17:00',
  friday_enabled BOOLEAN DEFAULT true,

  saturday_start TIME DEFAULT '09:00',
  saturday_end TIME DEFAULT '13:00',
  saturday_enabled BOOLEAN DEFAULT false,

  sunday_start TIME DEFAULT '09:00',
  sunday_end TIME DEFAULT '13:00',
  sunday_enabled BOOLEAN DEFAULT false,

  -- Appointment settings
  slot_duration INTEGER DEFAULT 30,         -- minutes
  buffer_time INTEGER DEFAULT 0,            -- minutes between appointments
  max_per_day INTEGER DEFAULT 20,
  booking_window_days INTEGER DEFAULT 30,   -- how far ahead customers can book
  min_notice_hours INTEGER DEFAULT 2,       -- minimum advance notice

  timezone TEXT DEFAULT 'Asia/Dubai',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

-- Blocked time slots (holidays, lunch breaks, etc.)
CREATE TABLE IF NOT EXISTS blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns to appointments if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'customer_name') THEN
    ALTER TABLE appointments ADD COLUMN customer_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'customer_phone') THEN
    ALTER TABLE appointments ADD COLUMN customer_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'customer_email') THEN
    ALTER TABLE appointments ADD COLUMN customer_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'appointment_type') THEN
    ALTER TABLE appointments ADD COLUMN appointment_type TEXT DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'duration') THEN
    ALTER TABLE appointments ADD COLUMN duration INTEGER DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'booked_via') THEN
    ALTER TABLE appointments ADD COLUMN booked_via TEXT DEFAULT 'whatsapp';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'notes') THEN
    ALTER TABLE appointments ADD COLUMN notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_sent_at') THEN
    ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'confirmation_sent_at') THEN
    ALTER TABLE appointments ADD COLUMN confirmation_sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_availability_tenant ON availability_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_tenant ON blocked_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_time ON blocked_slots(tenant_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date ON appointments(tenant_id, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status);

-- RLS policies
ALTER TABLE availability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to availability_settings"
  ON availability_settings FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to blocked_slots"
  ON blocked_slots FOR ALL
  USING (true) WITH CHECK (true);
