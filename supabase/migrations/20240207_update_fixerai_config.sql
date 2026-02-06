-- ═══════════════════════════════════════════════════════════════════
-- FIXERAI TECHNOLOGIES LTD - UPDATED PRODUCTION BUSINESS CONFIG
-- Updated: February 7, 2026
-- Changes: Added Pilot tier ($99), updated features to match built system
-- ═══════════════════════════════════════════════════════════════════

-- First, update the existing tenant if it exists
UPDATE tenants 
SET 
  services = '[
    {
      "category": "WhatsApp Sales Concierge",
      "type": "saas",
      "tagline": "24/7 AI Sales Agent for WhatsApp",
      "description": "Done-for-you AI-powered sales agent that responds in 4 seconds, qualifies leads, books appointments, and hands off to humans when needed. No setup fees.",
      "products": [
        {
          "name": "Pilot Plan",
          "monthly_price": "$99",
          "setup_fee": "$0",
          "conversations_per_month": 100,
          "features": [
            "24/7 AI responses in 4 seconds",
            "Lead qualification & scoring",
            "Basic dashboard access",
            "Single language (English OR Arabic)",
            "Email support (48-hour response)",
            "Monthly usage reports"
          ],
          "ideal_for": "Businesses testing AI sales automation",
          "typical_roi": "Experience the system before committing"
        },
        {
          "name": "Starter Plan",
          "monthly_price": "$299",
          "setup_fee": "$0",
          "conversations_per_month": 500,
          "features": [
            "24/7 AI responses in 4 seconds",
            "Lead qualification & scoring",
            "Appointment booking (Google Calendar integration)",
            "Full dashboard access with analytics",
            "WhatsApp Business API setup included",
            "Single language (English OR Arabic)",
            "Email + WhatsApp handoff notifications",
            "Email support (24-hour response)",
            "Monthly usage reports"
          ],
          "ideal_for": "Small businesses with 1-3 salespeople",
          "typical_roi": "30-40% increase in lead conversions"
        },
        {
          "name": "Growth Plan",
          "monthly_price": "$799",
          "setup_fee": "$0",
          "conversations_per_month": 2000,
          "features": [
            "Everything in Starter, plus:",
            "Bilingual support (English + Arabic)",
            "Lead temperature tracking (Hot/Warm/Cold)",
            "Multi-channel handoff (Email + WhatsApp + Telegram)",
            "Priority support (2-hour response)",
            "Advanced analytics dashboard"
          ],
          "ideal_for": "Growing businesses with 4-10 salespeople",
          "typical_roi": "15-40% more appointments booked, 20-30 hours/week saved"
        },
        {
          "name": "Scale Plan",
          "monthly_price": "$1,499",
          "setup_fee": "$0",
          "conversations_per_month": 5000,
          "features": [
            "Everything in Growth, plus:",
            "Multi-language support (English, Arabic + 1 more)",
            "Multi-number support (up to 3 WhatsApp numbers)",
            "Dedicated account manager",
            "Real-time support (30-minute response)",
            "Custom AI personality training",
            "API access for integrations"
          ],
          "ideal_for": "High-volume businesses and agencies (10+ salespeople)",
          "typical_roi": "30-50% increase in sales productivity, 40+ hours/week saved"
        }
      ],
      "topup_packs": [
        {
          "name": "Small Pack",
          "price": "$70",
          "conversations": 100,
          "per_conversation": "$0.70",
          "best_for": "Occasional overages"
        },
        {
          "name": "Medium Pack",
          "price": "$149",
          "conversations": 250,
          "per_conversation": "$0.60",
          "best_for": "Seasonal spikes"
        },
        {
          "name": "Large Pack",
          "price": "$399",
          "conversations": 1000,
          "per_conversation": "$0.40",
          "best_for": "Consistent high volume"
        }
      ]
    },
    {
      "category": "Custom Business Automation",
      "type": "project",
      "tagline": "Done-for-You Automation Systems",
      "description": "We build custom automation systems for your specific workflows. From lead management to invoice processing, we eliminate manual tasks.",
      "products": [
        {
          "name": "Speed to Lead System",
          "setup_price": "$2,500 - $5,000",
          "monthly_maintenance": "$800 - $1,500",
          "timeline": "3-5 business days",
          "description": "Instant 4-second WhatsApp response to form submissions from ads, website, social media. Lead qualification with HOT/WARM/COLD scoring. Real-time Telegram alerts.",
          "features": [
            "Instant WhatsApp auto-response",
            "Lead qualification scoring",
            "Telegram alerts for hot leads",
            "Multi-source capture (Facebook, Instagram, website)",
            "Basic analytics dashboard"
          ],
          "roi": "30-40% increase in lead conversions",
          "ideal_for": "Businesses running Facebook/Instagram ads, high-traffic websites"
        },
        {
          "name": "Lead Management Automation",
          "setup_price": "$5,000 - $8,000",
          "monthly_maintenance": "$1,500 - $2,500",
          "timeline": "10-14 business days",
          "description": "Multi-source lead capture, intelligent routing to sales reps, automated follow-up sequences, qualification scoring, CRM sync.",
          "features": [
            "Multi-source lead capture (website, ads, email, WhatsApp)",
            "Intelligent lead routing",
            "Automated follow-up sequences",
            "Lead scoring algorithm",
            "CRM synchronization",
            "Team performance dashboard"
          ],
          "roi": "Save 15-25 hours/week on manual data entry and follow-ups",
          "ideal_for": "Real estate agencies, insurance companies, B2B sales teams"
        },
        {
          "name": "Full Sales Automation Suite",
          "setup_price": "$8,000 - $12,000",
          "monthly_maintenance": "$2,500 - $4,000",
          "timeline": "14-21 business days",
          "description": "End-to-end sales automation: capture, qualify, nurture, book, analyze. Complete sales team in a box.",
          "features": [
            "Complete lead-to-close automation",
            "AI-powered nurture sequences",
            "Appointment booking automation",
            "Sales pipeline management",
            "Team collaboration tools",
            "Advanced analytics & forecasting",
            "WhatsApp + Email + SMS integration"
          ],
          "roi": "30-50% increase in sales productivity, 20+ hours/week saved",
          "ideal_for": "Sales teams, agencies, high-volume businesses"
        }
      ],
      "maintenance_includes": [
        "24/7 system monitoring & uptime tracking",
        "Bug fixes and updates",
        "Minor changes (adding fields, adjusting logic)",
        "Monthly optimization review",
        "Support via WhatsApp (2-hour response)",
        "Infrastructure costs (hosting, APIs, databases)",
        "Security updates and backups"
      ]
    },
    {
      "category": "Consulting & Strategy",
      "type": "consulting",
      "tagline": "Expert Guidance for Automation Success",
      "description": "Not sure where to start? Our consulting services help you identify opportunities, build roadmaps, and execute transformation.",
      "products": [
        {
          "name": "Automation Audit & Strategy",
          "price": "$3,500 - $5,000",
          "timeline": "5-7 business days",
          "deliverables": [
            "60-90 minute discovery call to map current processes",
            "Comprehensive 30-page automation roadmap",
            "Prioritized implementation plan (Phase 1, 2, 3)",
            "ROI projections for each automation opportunity",
            "60-minute presentation to leadership team",
            "3 monthly health checkups (track progress)"
          ],
          "credit_note": "Full fee credited toward implementation if you proceed within 30 days",
          "ideal_for": "SMEs ready to automate but unsure where to start"
        }
      ]
    }
  ]'::jsonb,
  faqs = '[
    {
      "category": "WhatsApp Sales Concierge",
      "questions": [
        {
          "q": "What exactly is the WhatsApp Sales Concierge?",
          "a": "It is a 24/7 AI sales agent living in your WhatsApp Business number. When customers message you, it responds in 4 seconds, answers questions, qualifies leads, and books appointments into your calendar automatically. Think of it as hiring a professional salesperson who never sleeps."
        },
        {
          "q": "How much does it cost?",
          "a": "We have 4 plans with ZERO setup fees: Pilot ($99/mo for 100 conversations - great for testing), Starter ($299/mo for 500 conversations), Growth ($799/mo for 2,000 conversations), and Scale ($1,499/mo for 5,000 conversations). If you exceed your conversation limit, you can buy top-ups: $70 for 100 extra conversations, $149 for 250, or $399 for 1,000."
        },
        {
          "q": "What counts as a conversation?",
          "a": "A conversation is a 24-hour messaging window with one customer. If a customer messages you Monday at 10am and you exchange 20 messages over the next 24 hours, that is 1 conversation. If they message again Wednesday, that is a new conversation. This is WhatsApp standard pricing model."
        },
        {
          "q": "What is the ROI? How do I know this will work?",
          "a": "Our clients typically see: 30-40% more leads converted (because of instant 4-second response vs hours/days), 15-40% more appointments booked (AI handles scheduling 24/7), and their sales team only talks to qualified hot leads. Start with our Pilot plan ($99/mo) to test it risk-free."
        },
        {
          "q": "How long does setup take?",
          "a": "5-7 business days from payment to launch. We gather your business info, services, FAQs, and train the AI. You see progress daily. Most clients go live with a basic version within 3-5 days."
        },
        {
          "q": "What if the AI does not know an answer?",
          "a": "The AI is trained on YOUR business info (services, pricing, FAQs). If it encounters a question it is not confident about, it will: (1) Acknowledge the question professionally, (2) Alert you via WhatsApp, Email, or Telegram immediately, (3) Wait for you to take over. You can manually reply or update the AI knowledge base."
        },
        {
          "q": "Can I cancel anytime?",
          "a": "Yes. No long-term contracts. You can cancel with 30 days notice. Monthly fees stop after your notice period. We provide all your data and conversation history if you leave."
        },
        {
          "q": "What features are included?",
          "a": "All plans include: 24/7 AI responses, lead qualification & scoring, dashboard access, and email support. Starter+ adds appointment booking and WhatsApp handoff. Growth+ adds bilingual support and Telegram handoff. Scale adds multi-number support and API access."
        }
      ]
    },
    {
      "category": "Getting Started",
      "questions": [
        {
          "q": "What is the first step?",
          "a": "Try our live demo! Message our WhatsApp demo bot to experience the AI yourself. Then book a free 30-minute strategy session where we review your business and show you exactly how it would work for you. Message us on WhatsApp at +1 541 909 8284 or email miracle@fixeraitech.com."
        },
        {
          "q": "Do you offer a trial?",
          "a": "Yes! Our Pilot plan at $99/month is essentially a trial - 100 conversations to test the system with your real customers. No setup fee, cancel anytime. This lets you experience the value before committing to a larger plan."
        },
        {
          "q": "Do you work with businesses outside the UAE?",
          "a": "Yes! While we are based in Dubai and specialize in UAE/GCC markets, we work with businesses across the Middle East, Africa, and globally. Our WhatsApp solutions work anywhere WhatsApp Business API is available."
        }
      ]
    }
  ]'::jsonb
WHERE company_name = 'FixerAI Technologies Ltd';

-- If no rows updated, insert new record
INSERT INTO tenants (
  company_name,
  subscription_tier,
  subscription_status,
  twilio_account_sid,
  twilio_auth_token,
  twilio_whatsapp_number,
  industry,
  language,
  business_hours,
  services,
  faqs,
  ai_provider,
  ai_model,
  monthly_conversation_limit,
  setup_fee_paid,
  setup_completed
)
SELECT
  'FixerAI Technologies Ltd',
  'scale',
  'active',
  'AC22ea003af2d31f748c6c6f900fcbe51d',
  'ae5ab081e94f5effe8d1708df462d2e9',
  'whatsapp:+15419098284',
  'other',
  ARRAY['en', 'ar'],
  '{
    "monday": "09:00-18:00",
    "tuesday": "09:00-18:00",
    "wednesday": "09:00-18:00",
    "thursday": "09:00-18:00",
    "friday": "09:00-18:00",
    "saturday": "10:00-14:00",
    "sunday": "Closed",
    "timezone": "Asia/Dubai"
  }'::jsonb,
  '[
    {
      "category": "WhatsApp Sales Concierge",
      "type": "saas",
      "tagline": "24/7 AI Sales Agent for WhatsApp",
      "description": "Done-for-you AI-powered sales agent that responds in 4 seconds, qualifies leads, books appointments, and hands off to humans when needed. No setup fees.",
      "products": [
        {
          "name": "Pilot Plan",
          "monthly_price": "$99",
          "setup_fee": "$0",
          "conversations_per_month": 100,
          "features": [
            "24/7 AI responses in 4 seconds",
            "Lead qualification & scoring",
            "Basic dashboard access",
            "Single language (English OR Arabic)",
            "Email support (48-hour response)",
            "Monthly usage reports"
          ],
          "ideal_for": "Businesses testing AI sales automation",
          "typical_roi": "Experience the system before committing"
        },
        {
          "name": "Starter Plan",
          "monthly_price": "$299",
          "setup_fee": "$0",
          "conversations_per_month": 500,
          "features": [
            "24/7 AI responses in 4 seconds",
            "Lead qualification & scoring",
            "Appointment booking (Google Calendar integration)",
            "Full dashboard access with analytics",
            "WhatsApp Business API setup included",
            "Single language (English OR Arabic)",
            "Email + WhatsApp handoff notifications",
            "Email support (24-hour response)",
            "Monthly usage reports"
          ],
          "ideal_for": "Small businesses with 1-3 salespeople",
          "typical_roi": "30-40% increase in lead conversions"
        },
        {
          "name": "Growth Plan",
          "monthly_price": "$799",
          "setup_fee": "$0",
          "conversations_per_month": 2000,
          "features": [
            "Everything in Starter, plus:",
            "Bilingual support (English + Arabic)",
            "Lead temperature tracking (Hot/Warm/Cold)",
            "Multi-channel handoff (Email + WhatsApp + Telegram)",
            "Priority support (2-hour response)",
            "Advanced analytics dashboard"
          ],
          "ideal_for": "Growing businesses with 4-10 salespeople",
          "typical_roi": "15-40% more appointments booked, 20-30 hours/week saved"
        },
        {
          "name": "Scale Plan",
          "monthly_price": "$1,499",
          "setup_fee": "$0",
          "conversations_per_month": 5000,
          "features": [
            "Everything in Growth, plus:",
            "Multi-language support (English, Arabic + 1 more)",
            "Multi-number support (up to 3 WhatsApp numbers)",
            "Dedicated account manager",
            "Real-time support (30-minute response)",
            "Custom AI personality training",
            "API access for integrations"
          ],
          "ideal_for": "High-volume businesses and agencies (10+ salespeople)",
          "typical_roi": "30-50% increase in sales productivity, 40+ hours/week saved"
        }
      ],
      "topup_packs": [
        {
          "name": "Small Pack",
          "price": "$70",
          "conversations": 100,
          "per_conversation": "$0.70",
          "best_for": "Occasional overages"
        },
        {
          "name": "Medium Pack",
          "price": "$149",
          "conversations": 250,
          "per_conversation": "$0.60",
          "best_for": "Seasonal spikes"
        },
        {
          "name": "Large Pack",
          "price": "$399",
          "conversations": 1000,
          "per_conversation": "$0.40",
          "best_for": "Consistent high volume"
        }
      ]
    }
  ]'::jsonb,
  '[
    {
      "category": "WhatsApp Sales Concierge",
      "questions": [
        {
          "q": "What exactly is the WhatsApp Sales Concierge?",
          "a": "It is a 24/7 AI sales agent living in your WhatsApp Business number. When customers message you, it responds in 4 seconds, answers questions, qualifies leads, and books appointments into your calendar automatically."
        },
        {
          "q": "How much does it cost?",
          "a": "We have 4 plans with ZERO setup fees: Pilot ($99/mo for 100 conversations), Starter ($299/mo for 500), Growth ($799/mo for 2,000), and Scale ($1,499/mo for 5,000). Top-ups available if you exceed limits."
        },
        {
          "q": "Can I try it first?",
          "a": "Yes! Our Pilot plan at $99/month is essentially a trial. Or message our demo bot on WhatsApp to experience the AI yourself before signing up."
        }
      ]
    }
  ]'::jsonb,
  'anthropic',
  'claude-sonnet-4-5',
  5000,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM tenants WHERE company_name = 'FixerAI Technologies Ltd'
);
