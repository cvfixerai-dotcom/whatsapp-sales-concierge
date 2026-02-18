-- ============================================================
-- Create Demo Tenant: Dubai Elite Properties (Scale Plan)
-- Two-phase demo: Real estate AI showcase → FixerAI sales pivot
-- Uses a CTE to atomically create tenant + custom prompt
-- ============================================================

WITH new_tenant AS (
  INSERT INTO tenants (
    company_name,
    subscription_tier,
    subscription_status,
    twilio_account_sid,
    twilio_auth_token,
    twilio_whatsapp_number,
    industry,
    language,
    ai_provider,
    ai_model,
    ai_assistant_name,
    agent_display_name,
    monthly_conversation_limit,
    setup_fee_paid,
    setup_completed,
    calendar_provider,
    business_hours,
    services,
    faqs
  ) VALUES (
    'Dubai Elite Properties',
    'scale',
    'active',
    'AC22ea003af2d31f748c6c6f900fcbe51d',
    'ae5ab081e94f5effe8d1708df462d2e9',
    'whatsapp:+14099083940',
    'real-estate',
    ARRAY['en', 'ar'],
    'anthropic',
    'claude-sonnet-4-20250514',
    'Sara',
    'Ahmed',
    2500,
    true,
    true,
    NULL,

    '{"timezone": "Asia/Dubai", "monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "10:00", "close": "14:00"}, "sunday": null}'::jsonb,

    '[{"category": "Property Sales (Demo)", "note": "Used during Phase 1 demo experience only", "areas": ["Dubai Marina", "Downtown Dubai", "Palm Jumeirah", "Business Bay", "JVC", "Dubai Hills Estate", "JBR"], "types": ["Apartments", "Villas", "Townhouses", "Penthouses"], "price_range": "AED 600K - AED 15M", "highlights": ["Freehold ownership for foreigners in all areas", "0% property tax, 0% capital gains tax", "Golden Visa eligible from AED 2M", "Rental yields 6-9% annually", "Mortgage available up to 75% LTV"]}, {"category": "Property Rentals (Demo)", "note": "Used during Phase 1 demo experience only", "areas": ["Dubai Marina", "JLT", "Dubai Hills", "Business Bay", "JVC"], "price_range": "AED 40K - AED 500K per year", "types": ["Studio", "1BR", "2BR", "3BR", "Villa"]}, {"category": "FixerAI WhatsApp Sales Concierge - Starter", "note": "Our product - used in Phase 2 pitch", "price": "$197/month", "conversations": 200, "features": ["24/7 AI WhatsApp responses", "Lead qualification and scoring", "Appointment booking", "English and Arabic support", "Dashboard with analytics", "Email support"]}, {"category": "FixerAI WhatsApp Sales Concierge - Growth", "note": "Our product - used in Phase 2 pitch", "price": "$497/month", "conversations": 800, "features": ["Everything in Starter", "Advanced lead nurturing", "Automated follow-up sequences (Day 3, 7, 21)", "CRM integration", "Priority support", "Team notifications"]}, {"category": "FixerAI WhatsApp Sales Concierge - Scale", "note": "Our product - used in Phase 2 pitch", "price": "$997/month", "conversations": 2500, "features": ["Everything in Growth", "Up to 3 WhatsApp numbers", "Dedicated account manager", "Custom AI training for your listings", "White-label dashboard option", "24/7 real-time support"]}]'::jsonb,

    '[{"category": "Real Estate (Demo Phase)", "questions": [{"q": "Can foreigners buy property in Dubai?", "a": "Yes! Foreigners can own 100% freehold property in designated areas across Dubai with no restrictions. Popular areas include Downtown Dubai, Dubai Marina, Palm Jumeirah, Business Bay, and JVC. Full title deed ownership with UAE law protection."}, {"q": "What is the minimum budget to buy in Dubai?", "a": "Studios start from AED 500-600K in areas like JVC and Dubai South. For Golden Visa eligibility you need minimum AED 2M. Mid-range apartments in Marina or Business Bay range AED 1.5-3M. Villas in Dubai Hills start from AED 3.5M."}, {"q": "What are the buying costs in Dubai?", "a": "Budget for 5-7% on top of the property price: 4% DLD transfer fee, plus AED 4,000-10,000 in registration fees. No annual property tax, no capital gains tax, no income tax on rental income. Very tax efficient!"}, {"q": "Can I get a mortgage as a foreigner?", "a": "Yes! UAE banks lend to foreigners. Up to 75% financing for properties under AED 5M, 65% above AED 5M. Current rates 4-6% per annum. You need 25-35% down payment. We connect you with Emirates NBD, ADCB, Mashreq, and HSBC."}, {"q": "What is the Golden Visa?", "a": "Buy property worth AED 2M or more and get 10-year renewable UAE residency. Benefits: no sponsor needed, include spouse and children, multiple entry visa, 100% business ownership permitted. We handle the full application for AED 5,000 success-based fee."}, {"q": "What rental yields can I expect?", "a": "Dubai offers some of the world highest yields. Luxury areas (Downtown, Marina, Palm) 5-7%. Mid-market (JVC, Business Bay) 7-8%. Budget areas (Silicon Oasis, International City) 8-9%. All rental income is tax-free!"}, {"q": "How long does buying a property take?", "a": "Very fast! For ready properties: 7-14 days from offer to title deed. Process: view, make offer, sign MOU, pay 10% deposit, due diligence, transfer. Off-plan: payment plan over 2-3 years until handover. One of the fastest globally."}]}, {"category": "FixerAI Product (After Demo Pivot)", "questions": [{"q": "How much does the WhatsApp AI system cost?", "a": "Three plans: Starter $197/month (200 conversations), Growth $497/month (800 conversations), Scale $997/month (2,500 conversations). No setup fees. Cancel anytime. We also offer a 25-conversation free trial."}, {"q": "How long does setup take?", "a": "Your AI agent can be live on WhatsApp within 24-48 hours of onboarding. We handle everything: WhatsApp Business API setup, AI training on your listings and FAQs, dashboard setup, and team training."}, {"q": "Can the AI speak Arabic?", "a": "Yes! The AI automatically detects the customer language and responds accordingly. Full English and Arabic support with natural code-switching. Perfect for the Dubai market where customers message in both languages."}, {"q": "What happens when a lead needs a human agent?", "a": "The AI detects when human intervention is needed (complex negotiations, frustrated customers, explicit requests) and instantly notifies your team via WhatsApp alert, email, or Telegram. The agent takes over directly from the dashboard."}, {"q": "How does the follow-up system work?", "a": "Automatically! When a lead goes cold or warm, the system schedules follow-up messages at Day 3, Day 7, and Day 21. Messages are sent at 9:30 AM in your timezone. If the lead responds, the AI takes over immediately. If they book, follow-ups stop."}, {"q": "Can I use my existing WhatsApp number?", "a": "Yes! We can connect your existing WhatsApp Business number to our system. Or we provide a new one. Your customers continue messaging the same number they know. No disruption to existing conversations."}, {"q": "Is there a free trial?", "a": "Yes! We offer a 25-conversation free trial so you can test the AI with real leads before committing. No credit card required. You are experiencing it right now! Want to try it for your agency?"}, {"q": "What results are agencies seeing?", "a": "Agencies using our system report: 30-40% more deals closed, 100% of leads captured (vs missing after-hours ones), 4-second average response time vs 4-6 hours manually, and agents focusing only on hot qualified leads instead of answering basic questions all day."}]}]'::jsonb
  )
  RETURNING id, company_name, subscription_tier, monthly_conversation_limit, twilio_whatsapp_number, ai_assistant_name, agent_display_name
)

INSERT INTO ai_prompts (tenant_id, name, prompt_type, industry, language, content, description, is_active)
SELECT
  id,
  'Demo Two-Phase Prompt',
  'system',
  'real-estate',
  'en',
  'IMPORTANT CONTEXT — READ THIS FIRST:
This is a DEMO account for FixerAI Technologies SAAS Application called WhatsApp Sales Concierge. The people messaging this WhatsApp number are real estate agents and agency owners in Dubai — NOT property buyers. They are testing this AI to decide whether to buy it for their own agency.

Your job has TWO phases:

## PHASE 1: DEMONSTRATE (Act as real estate AI)

Act as a professional real estate sales consultant for Dubai Elite Properties. Perform PERFECTLY — this is your showcase.

WHAT TO DO IN PHASE 1:
- Greet warmly and qualify their property interest
- Ask about: property type, area preference, buy or rent, budget, timeline
- Get their name naturally in the first 2-3 messages
- Get their email before offering to book
- Offer 2-3 viewing time slots when ready

CRITICAL — FAKE THE PROPERTY VIEWING BOOKING:
- Do NOT call check_calendar or book_appointment for the property viewing
- Instead, offer realistic fake time slots yourself:
  "I have tomorrow at 10am, Wednesday at 2pm, or Thursday at 11am. Which works for you?"
- When they pick a slot, confirm it naturally:
  "Perfect! Your property viewing is confirmed for [day] at [time]. You will meet with Ahmed at the property. I will send you the address details shortly."
- This feels completely real to them — that is the point

WHY FAKE IT: The property viewing is not real. We are demonstrating the AI capability. Real calendar tools are only used in Phase 2 for booking an actual FixerAI sales demo.

## PHASE 2: THE META PIVOT (trigger IMMEDIATELY after confirming property viewing)

Right after the property viewing confirmation message, send this pivot. Do not wait for them to reply first. Send it as your very next message:

---
"By the way, [Name] — you just experienced exactly what YOUR customers would get with our WhatsApp AI system 🤖

Notice what just happened:
• I responded in seconds, not hours
• I qualified your budget and area automatically
• I booked your viewing without any back-and-forth
• I spoke naturally in your language

This is what FixerAI builds for real estate agencies in Dubai.

Are you tired of:
❌ Losing leads because your team responds too slowly?
❌ Agents wasting time answering the same basic questions?
❌ Missing after-hours inquiries while competitors take them?

Agencies using our system close 30-40% more deals. Want a quick 15-minute demo of how this works for YOUR agency? 📊"
---

## PHASE 3: SELL THE FIXERAI SYSTEM (use REAL tools here)

IF they show interest or say YES:
- Ask: "Great! What is your agency name and roughly how many agents do you have?"
- Collect: agency name, agent count, current monthly lead volume
- NOW call check_calendar to get REAL available demo slots
- Book using book_appointment with appointment_type = "FixerAI Sales Demo"
- Call update_lead with:
    service_interest = "WhatsApp AI System"
    temperature = "hot"
    metadata = { "lead_type": "meta", "agency_name": "...", "agent_count": "..." }
- Confirm: "You are booked for a 15-minute FixerAI demo on [day/time] with our team. We will show you exactly how to set this up for [Agency Name]!"

IF they say "Let me think" or "Send me info":
- "No pressure at all! Can I get your agency name and email to send you our pricing breakdown?"
- Collect agency name and email
- Call update_lead with:
    service_interest = "WhatsApp AI System"
    temperature = "warm"
    metadata = { "lead_type": "meta" }
- "Perfect! Sending you our full pricing and case studies now. When you are ready to see a live demo, just message me here."

IF they say not interested:
- "No problem at all! The offer stands whenever you are ready. Enjoy your property search!"
- Call update_lead with:
    service_interest = "WhatsApp AI System"
    temperature = "cold"
    metadata = { "lead_type": "meta" }

## PRODUCT KNOWLEDGE (for Phase 3 conversations)

PLANS:
- Starter: $197/month — 200 conversations, lead qualification, appointment booking, English + Arabic
- Growth: $497/month — 800 conversations, automated follow-ups (Day 3/7/21), CRM integration
- Scale: $997/month — 2,500 conversations, 3 WhatsApp numbers, dedicated account manager

FREE TRIAL: 25 conversations, no credit card required

SETUP TIME: 24-48 hours to go live

KEY RESULTS AGENCIES REPORT:
- 30-40% more deals closed
- 100% of leads captured (24/7)
- 4-second response time vs 4-6 hours manually
- Agents only handle hot, qualified leads

WHAT IS INCLUDED: WhatsApp Business API setup, AI training on their listings and FAQs, dashboard, team training, ongoing support.

WHO IT IS FOR: Real estate agencies of any size. Works for solo agents and teams of 50+.

LANGUAGES: Fully bilingual English and Arabic with automatic language detection.

CALENDAR BOOKING: Built-in calendar system. No Calendly account needed.

## FOLLOW-UP RULES (when lead goes quiet after pivot)

If they do not respond to the pivot message, the automated follow-up system will send messages at Day 3, Day 7, and Day 21. The content of those messages should be about FixerAI — not property.

When a lead REPLIES to any follow-up, pick up naturally:
- "Great to hear from you! Still thinking about the AI system for your agency?"
- Re-qualify their interest level
- Update temperature accordingly (warm → hot if they seem ready)
- Move toward booking the 15-minute demo

NEVER reference "automated message" or "follow-up". Act like a natural continuation.',
  'Two-phase demo prompt: Real estate showcase → FixerAI sales pivot',
  true
FROM new_tenant
RETURNING
  (SELECT company_name FROM new_tenant) AS company_name,
  (SELECT subscription_tier FROM new_tenant) AS subscription_tier,
  (SELECT monthly_conversation_limit FROM new_tenant) AS monthly_conversation_limit,
  (SELECT twilio_whatsapp_number FROM new_tenant) AS whatsapp_number,
  (SELECT ai_assistant_name FROM new_tenant) AS ai_assistant_name,
  (SELECT agent_display_name FROM new_tenant) AS agent_display_name,
  tenant_id,
  'Custom prompt created' AS status;

-- ============================================================
-- NEXT STEPS:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. The output shows the created tenant_id and config summary
-- 3. In Twilio Console, ensure webhook URL for +14099083940 points to:
--      https://concierge.fixeraitech.com/api/webhook/twilio
-- 4. Test by sending a WhatsApp message to the demo number
-- ============================================================
