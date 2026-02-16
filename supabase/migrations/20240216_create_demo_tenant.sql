-- ============================================================
-- Create Demo Tenant: Dubai Properties AI (Scale Plan)
-- This makes the demo WhatsApp number use the REAL AI pipeline
-- instead of the hardcoded demo bot.
-- ============================================================

-- 1. Insert the tenant record
-- IMPORTANT: Update the values below to match your actual business details
INSERT INTO tenants (
  company_name,
  subscription_tier,
  subscription_status,
  twilio_account_sid,
  twilio_auth_token,
  twilio_whatsapp_number,
  industry,
  ai_provider,
  ai_model,
  monthly_conversation_limit,
  setup_completed,
  ai_assistant_name,
  agent_display_name,
  business_hours,
  services,
  faqs
) VALUES (
  -- === COMPANY INFO (update these) ===
  'Dubai Properties AI',          -- company_name
  'scale',                        -- subscription_tier (Scale plan = 2500 conversations)
  'active',                       -- subscription_status
  
  -- === TWILIO CREDENTIALS (from your .env) ===
  'AC22ea003af2d31f748c6c6f900fcbe51d',  -- twilio_account_sid
  'ae5ab081e94f5effe8d1708df462d2e9',    -- twilio_auth_token
  'whatsapp:+14099083940',               -- twilio_whatsapp_number (demo number)
  
  -- === AI CONFIG ===
  'real-estate',                  -- industry
  'openai',                       -- ai_provider (openai or anthropic)
  'gpt-4o',                       -- ai_model
  2500,                           -- monthly_conversation_limit (Scale plan)
  true,                           -- setup_completed
  
  -- === NAMES (update these) ===
  'Amara',                        -- ai_assistant_name (the AI's name in chat)
  'Emmanuel',                     -- agent_display_name (your name for appointment bookings)
  
  -- === BUSINESS HOURS (Dubai timezone, update as needed) ===
  '{
    "sunday": {"open": "09:00", "close": "18:00"},
    "monday": {"open": "09:00", "close": "18:00"},
    "tuesday": {"open": "09:00", "close": "18:00"},
    "wednesday": {"open": "09:00", "close": "18:00"},
    "thursday": {"open": "09:00", "close": "18:00"},
    "friday": {"closed": true},
    "saturday": {"open": "10:00", "close": "16:00"}
  }'::jsonb,
  
  -- === SERVICES (update with your actual property services) ===
  '[
    {
      "name": "Property Sales",
      "areas": ["Dubai Marina", "Downtown Dubai", "Palm Jumeirah", "JBR", "Business Bay"],
      "price_range": "AED 1.5M - AED 15M",
      "note": "Apartments, villas, penthouses"
    },
    {
      "name": "Property Rentals",
      "areas": ["Dubai Marina", "Downtown Dubai", "JLT", "DIFC", "Dubai Hills"],
      "price_range": "AED 50K - AED 500K/year",
      "note": "Furnished and unfurnished options"
    },
    {
      "name": "Off-Plan Investments",
      "areas": ["Dubai Creek Harbour", "Mohammed Bin Rashid City", "Dubai South"],
      "price_range": "AED 800K - AED 5M",
      "note": "Payment plans available"
    },
    {
      "name": "Property Viewings",
      "note": "Free property tours with our expert agents"
    }
  ]'::jsonb,
  
  -- === FAQs (update with your actual FAQs) ===
  '[
    {"question": "What areas do you cover?", "answer": "We cover all of Dubai including Marina, Downtown, Palm Jumeirah, JBR, Business Bay, JLT, DIFC, and Dubai Hills."},
    {"question": "Do you handle rentals and sales?", "answer": "Yes, we handle both property sales and rentals across Dubai."},
    {"question": "What is the minimum budget?", "answer": "For sales, properties start from AED 800K. For rentals, from AED 50K per year."},
    {"question": "Can I schedule a property viewing?", "answer": "Absolutely! I can book a viewing for you right now. Which property interests you?"},
    {"question": "Do you offer payment plans?", "answer": "Yes, many of our off-plan properties offer attractive payment plans with as little as 10% down payment."},
    {"question": "Are you available on weekends?", "answer": "We are open Saturday 10AM-4PM. Friday is closed. Sunday through Thursday 9AM-6PM."}
  ]'::jsonb
)
RETURNING id;

-- 2. (Optional) Add a custom system prompt for extra business-specific instructions
-- Get the tenant ID from the INSERT above and use it here.
-- Uncomment and update the tenant_id after running the INSERT above.

-- INSERT INTO ai_prompts (tenant_id, name, prompt_type, industry, language, content, description, is_active)
-- VALUES (
--   'PASTE_TENANT_ID_HERE',
--   'Custom System Prompt',
--   'system',
--   'real-estate',
--   'en',
--   'Additional custom instructions:
-- - Focus on Dubai Marina and Downtown properties as our primary listings.
-- - Mention that we offer free property tours with pick-up service.
-- - If the customer asks about mortgage/financing, mention we have partner banks with competitive rates.
-- - Always emphasize that properties in Dubai are freehold for expats.
-- - If someone asks about visa, mention that property purchases over AED 750K qualify for a Golden Visa.',
--   'Custom instructions for Dubai Properties AI demo tenant',
--   true
-- );

-- ============================================================
-- NEXT STEPS:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Copy the returned tenant ID
-- 3. In Twilio Console, change the webhook URL for +14099083940 from:
--      https://concierge.fixeraitech.com/api/webhook/demo
--    to:
--      https://concierge.fixeraitech.com/api/webhook/twilio
-- 4. Test by sending a WhatsApp message to the demo number
-- 5. (Optional) Uncomment the ai_prompts INSERT and add your tenant_id
--    for custom instructions on top of the base prompt
-- ============================================================
