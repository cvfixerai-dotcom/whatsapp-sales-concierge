-- ================================================================
-- DEMO TENANT CONFIG - Run in Supabase SQL Editor
-- Powers the /realestate demo page WhatsApp: +1 409 908 3940
-- ================================================================

-- STEP 1: New columns for enhanced AI system
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_assistant_name TEXT DEFAULT 'Sarah';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_display_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_conversation_limit INTEGER DEFAULT 25;

-- STEP 2: Insert demo tenant
INSERT INTO tenants (
  company_name, subscription_tier, subscription_status, industry,
  twilio_whatsapp_number, language, timezone,
  ai_provider, ai_model, ai_assistant_name, agent_display_name,
  ai_personality, ai_language, ai_greeting, ai_fallback_message,
  business_type, business_description, target_audience,
  monthly_conversation_limit, onboarding_completed, setup_completed,
  business_hours, services, faqs, handoff_settings
) VALUES (
  'Demo Miracle',
  'scale',
  'active',
  'real-estate',
  '+14099083940',
  ARRAY['en', 'ar'],
  'Asia/Dubai',
  'anthropic',
  'claude-3-sonnet-20240229',
  'Sarah',
  'Demo Miracle Agent',
  'professional',
  'en',
  E'Hi! \U0001F44B I''m Sarah from Demo Miracle. I help people find their perfect property here. Whether you''re looking to buy, rent, or invest \u2014 I''m here to help! What type of property are you interested in?',
  'I appreciate your patience! Let me connect you with one of our property consultants who can help you further.',
  'real_estate',
  'Leading real estate agency specializing in residential and commercial properties across Dubai and UAE.',
  'Property buyers, renters, and investors in Dubai and UAE',
  2500,
  true,
  true,
  '{"sunday":{"open":"09:00","close":"18:00"},"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"10:00","close":"14:00"},"saturday":{"open":"10:00","close":"16:00"}}'::jsonb,
  '[{"name":"Apartments - Buy","areas":["Dubai Marina","Downtown","JBR","Business Bay","JLT","Dubai Hills"],"price_range":"AED 500K - 5M"},{"name":"Apartments - Rent","areas":["Dubai Marina","Downtown","JBR","Business Bay","JLT"],"price_range":"AED 30K - 250K/year"},{"name":"Villas - Buy","areas":["Arabian Ranches","Dubai Hills","Palm Jumeirah","Emirates Hills"],"price_range":"AED 2M - 30M"},{"name":"Villas - Rent","areas":["Arabian Ranches","Dubai Hills","Jumeirah","Mirdif"],"price_range":"AED 100K - 500K/year"},{"name":"Off-Plan","areas":["Creek Harbour","Dubai South","MBR City","Emaar Beachfront"],"price_range":"AED 600K - 10M","note":"Payment plans: 60/40 or 1% monthly"},{"name":"Commercial","areas":["Business Bay","DIFC","JLT","Downtown"],"price_range":"AED 1M - 20M"}]'::jsonb,
  '[{"question":"Do you offer payment plans?","answer":"Yes! Off-plan properties offer flexible plans: 60/40, 70/30, or 1% monthly installments."},{"question":"What is the ROI in Dubai Marina?","answer":"Dubai Marina typically yields 6-8% annual rental returns, one of the best for investment."},{"question":"Can foreigners buy in Dubai?","answer":"Absolutely! Dubai has freehold areas where any nationality can buy with full ownership rights."},{"question":"What are the buying costs?","answer":"4% DLD transfer fee + 2% agency commission + AED 4,000 admin fees. We guide you through everything."},{"question":"Do you help with mortgage?","answer":"Yes, we work with all major UAE banks for pre-approval with competitive rates."},{"question":"What areas do you cover?","answer":"All major Dubai areas: Marina, Downtown, JBR, Business Bay, Dubai Hills, Arabian Ranches, Palm Jumeirah, and more."},{"question":"How long to buy?","answer":"About 30 days for ready properties. Off-plan is immediate with a reservation fee."},{"question":"Do you handle rentals?","answer":"Yes! We help with both buying and renting across all our covered areas."}]'::jsonb,
  '{"channels":{"dashboard":true,"email":true,"whatsapp":false,"telegram":false},"recipients":{"email":null,"whatsapp":null,"telegram_chat_id":null},"escalation":{"enabled":false,"timeout_minutes":5,"escalation_channel":"email"}}'::jsonb
);

-- STEP 3: Get the tenant ID for user creation
-- Run this after step 2, copy the ID:
-- SELECT id FROM tenants WHERE twilio_whatsapp_number = '+14099083940';

-- STEP 4: Create owner user (replace <TENANT_ID> and set your email)
-- IMPORTANT: Generate password hash first with bcrypt. 
-- For 'password123' the hash is: $2a$10$rOzBqBHwDGvMlP8GpCsQ4OQfMCiiMbwP3BXVkO2ZPBqGBv5v1J3lW
-- Change this to a secure password!
--
-- INSERT INTO users (tenant_id, email, password_hash, role, full_name, is_active)
-- VALUES (
--   '<TENANT_ID>',
--   'lordskempo@yahoo.com',
--   '$2a$10$rOzBqBHwDGvMlP8GpCsQ4OQfMCiiMbwP3BXVkO2ZPBqGBv5v1J3lW',
--   'owner',
--   'Demo Miracle',
--   true
-- );

-- STEP 5: Set Twilio credentials (replace with your actual keys)
-- UPDATE tenants SET
--   twilio_account_sid = 'YOUR_TWILIO_ACCOUNT_SID',
--   twilio_auth_token = 'YOUR_TWILIO_AUTH_TOKEN'
-- WHERE twilio_whatsapp_number = '+14099083940';
