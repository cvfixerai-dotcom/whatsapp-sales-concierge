-- Multi-Channel Handoff System Migration
-- Run this in Supabase SQL Editor

-- Add handoff settings to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS handoff_settings JSONB DEFAULT '{
  "channels": {
    "dashboard": true,
    "email": true,
    "whatsapp": false,
    "telegram": false
  },
  "recipients": {
    "email": null,
    "whatsapp": null,
    "telegram_chat_id": null
  },
  "escalation": {
    "enabled": false,
    "timeout_minutes": 5,
    "escalation_channel": "email"
  }
}';

-- Create handoff_events table for tracking
CREATE TABLE IF NOT EXISTS handoff_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Trigger information
  triggers TEXT[] DEFAULT '{}',
  ai_summary TEXT,
  last_customer_message TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'expired')),
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Notification tracking (timestamps for each channel)
  notifications_sent JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_handoff_events_tenant ON handoff_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_handoff_events_status ON handoff_events(status);
CREATE INDEX IF NOT EXISTS idx_handoff_events_conversation ON handoff_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoff_events_created ON handoff_events(created_at DESC);

-- Enable realtime for handoff_events
ALTER PUBLICATION supabase_realtime ADD TABLE handoff_events;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_handoff_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handoff_events_updated_at ON handoff_events;
CREATE TRIGGER trigger_handoff_events_updated_at
  BEFORE UPDATE ON handoff_events
  FOR EACH ROW
  EXECUTE FUNCTION update_handoff_events_updated_at();

-- Comments for documentation
COMMENT ON TABLE handoff_events IS 'Tracks handoff requests from AI to human agents';
COMMENT ON COLUMN handoff_events.triggers IS 'Array of reasons that triggered the handoff';
COMMENT ON COLUMN handoff_events.notifications_sent IS 'JSON object tracking which channels were notified and when';
COMMENT ON COLUMN tenants.handoff_settings IS 'JSON configuration for handoff notification preferences';
