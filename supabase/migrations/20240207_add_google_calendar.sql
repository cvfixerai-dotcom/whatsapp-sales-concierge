-- Add Google Calendar support to tenants table
-- Run this migration in Supabase SQL Editor

-- Add calendar_provider column (default to 'calendly' for backward compatibility)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS calendar_provider TEXT DEFAULT 'calendly' 
CHECK (calendar_provider IN ('calendly', 'google'));

-- Add Google Calendar fields
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- Update appointments table to support multiple providers
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS calendar_provider TEXT DEFAULT 'calendly';

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tenants.calendar_provider IS 'Calendar provider: calendly or google';
COMMENT ON COLUMN tenants.google_calendar_id IS 'Google Calendar ID (usually primary email or calendar ID)';
COMMENT ON COLUMN tenants.google_refresh_token IS 'Google OAuth refresh token for calendar access';
