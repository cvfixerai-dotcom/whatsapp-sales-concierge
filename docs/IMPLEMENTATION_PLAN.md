# Implementation Plan: Sales-Ready Real Estate System

## Current State Analysis

After auditing the entire codebase, here's what **EXISTS** and what's **MISSING**:

### ✅ Already Built
| Feature | Status | Notes |
|---|---|---|
| AI conversational agent | Working | Responds on WhatsApp, uses tools |
| Lead scoring | Working | Scores 0-100 based on name, email, budget, timeline, messages, appointment |
| Temperature tracking | Working | AI calls `update_lead` → sets hot/warm/cold |
| Calendar booking | Working | In-app calendar + external fallback |
| Human handoff | Working | Agent takeover via dashboard |
| WhatsApp chat UI | Working | Dashboard chat with reply |
| Landing page `/realestate` | Working | Has features, pricing, testimonials, demo link, FAQ |
| Onboarding flow | Working | 5 steps: business profile, Twilio, AI config, calendar, handoff |
| Industry prompts | Working | Real-estate, automotive, medical, home-services, other |

### ❌ Missing (What We Need to Build)

| Gap | Impact | Priority |
|---|---|---|
| **No follow-up sequences** | Warm/cold leads die after first conversation | 🔴 Critical |
| **AI doesn't know HOW to classify temperature** | Prompt lacks clear hot/warm/cold rules | 🔴 Critical |
| **Onboarding doesn't auto-set `industry` on tenant** | Prompt falls back to "other" instead of "real-estate" | 🔴 Critical |
| **No trial period enforcement** | Can't offer 7-day trial safely | 🟡 High |
| **No conversation rate limiting** | Trial users could abuse | 🟡 High |
| **Demo page uses Twilio sandbox number** | Demo doesn't work with your actual AI | 🟡 High |
| **Demo page lacks "Book Discovery Call" CTA** | No way to capture agent leads | 🟡 High |
| **Real estate prompt is thin** | Only 5 lines, needs full conversion strategy | 🔴 Critical |

---

## Build Plan (6 Parts)

### PART 1: Automated Follow-Up Sequences 🔴

**The Problem**: When a lead chats but doesn't book, they disappear forever. No one follows up.

**The Solution**: A scheduled follow-up system that sends pre-written WhatsApp messages at Day 3, Day 7, and Day 21.

#### Database

```sql
-- follow_up_sequences: template library per industry
CREATE TABLE follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  industry TEXT NOT NULL DEFAULT 'real-estate',
  
  sequence_name TEXT NOT NULL,       -- 'warm_lead_nurture', 'cold_lead_reactivation'
  target_temperature TEXT NOT NULL,   -- 'warm', 'cold', 'new'
  
  day_3_message TEXT NOT NULL,
  day_7_message TEXT NOT NULL,  
  day_21_message TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- scheduled_followups: tracks individual follow-ups per contact
CREATE TABLE scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES follow_up_sequences(id) ON DELETE SET NULL,
  
  follow_up_type TEXT NOT NULL,       -- 'day_3', 'day_7', 'day_21'
  scheduled_for TIMESTAMPTZ NOT NULL,
  message_content TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending',      -- pending, sent, cancelled, skipped
  sent_at TIMESTAMPTZ,
  cancelled_reason TEXT,              -- 'converted', 'manual_cancel', 'human_active'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_followups_pending ON scheduled_followups(status, scheduled_for) 
  WHERE status = 'pending';
CREATE INDEX idx_followups_contact ON scheduled_followups(contact_id, status);
```

#### Follow-Up Logic

```
Lead has conversation → doesn't book → conversation goes inactive
        |
        v
  After 1 hour of no messages:
  AI checks contact temperature:
        |
        ├── HOT (score >= 70) → No auto follow-up (agent should call them)
        │                        → Dashboard alert: "Hot lead needs manual follow-up!"
        │
        ├── WARM (score 30-69) → Schedule follow-up sequence:
        │   Day 3: "Hi {{name}}! Just checking in - still thinking about that 
        │          {{property_type}} in {{area}}? I can show you some new options 😊"
        │   Day 7: "Hey {{name}}, we just got a few new listings in {{area}} that 
        │          match your budget. Want me to send details?"
        │   Day 21: "Hi {{name}}! Haven't heard from you in a while. Just wanted to let 
        │           you know we're here whenever you're ready. Any questions at all? 🏠"
        │
        └── COLD (score < 30) → Schedule lighter sequence:
            Day 7:  "Hi! We noticed you were interested in properties earlier. 
                    Our market has some great new options. Want a quick update?"
            Day 21: "Hey there! Just a friendly reminder - we're here to help 
                    whenever you're ready to explore properties. No pressure at all 😊"
```

#### Auto-Cancel Rules
Follow-ups are **automatically cancelled** when:
- Contact books an appointment (temperature → "booked")
- Contact sends a new message (restarts the conversation cycle)
- Agent takes over the conversation (status → "human-handling")
- Contact is manually marked as "lost"

#### API Endpoint: `POST /api/followups/process`
- Called by a CRON job (Vercel cron or external) every 15 minutes
- Finds all `scheduled_followups` where `status = 'pending'` AND `scheduled_for <= NOW()`
- Sends each message via Twilio
- Updates status to `sent`

#### Pre-Written Templates (Real Estate)

**Warm Lead - Day 3:**
> Hi {{name}}! I was just thinking about our chat the other day. Still looking for that {{property_type}} in {{area}}? I've got a couple of new options that might be perfect for you. Want me to share details? 🏠

**Warm Lead - Day 7:**
> Hey {{name}}! Quick update - a few new properties just came on the market in {{area}} within your budget range. The market moves fast here. Shall I send you the top picks?

**Warm Lead - Day 21:**
> Hi {{name}}, hope you're doing well! Just wanted to check in. If you're still exploring the property market, I'm here to help anytime. No rush at all - just let me know when you're ready 😊

**Cold Lead - Day 7:**
> Hi there! We noticed you were looking at properties recently. The market has some exciting new listings. Would you like a quick update on what's available?

**Cold Lead - Day 21:**
> Hey! Just a friendly reminder that we're here whenever you're ready to explore properties. Drop me a message anytime - happy to help 🏠

---

### PART 2: Enhanced Real Estate AI Prompt 🔴

**Current prompt** (6 lines — too thin):
```
INDUSTRY: Real Estate
YOUR ROLE: Property consultant for {{company_name}}.
QUALIFYING QUESTIONS: type, area, budget, timeline
CLOSING MOVE: Offer a property viewing.
```

**New prompt** (comprehensive, based on real estate sales methodology):

```
INDUSTRY: Real Estate
YOUR ROLE: Property consultant for {{company_name}}.

LEAD TEMPERATURE CLASSIFICATION (update via update_lead tool):
After each message, assess the lead and set temperature:

→ HOT (set temperature='hot', timeline='urgent' or 'this-week'):
  - Has budget AND timeline AND specific area/type
  - Actively asking about viewings or availability
  - Responding quickly and with detail
  - Phrases like: "I need to move by...", "I'm ready to buy", "Can I see it today?"

→ WARM (set temperature='warm', timeline='this-month' or 'exploring'):
  - Has shown interest but missing budget OR timeline
  - Asked general questions without urgency
  - Still comparing options
  - Phrases like: "I'm looking around", "What do you have?", "Just checking prices"

→ COLD (set temperature='cold'):
  - Only asked 1-2 questions then stopped responding
  - Explicitly said they're not ready
  - No budget mentioned, no timeline, just browsing
  - Phrases like: "Just curious", "Maybe later", "I'll think about it"

QUALIFYING QUESTIONS (ask ONE at a time, in this order):
1. "What type of property are you looking for? Apartment, villa, or something else?"
2. "Which area or neighborhood do you prefer?"
3. "Are you looking to buy or rent?"
4. "What's your budget range?" (this is KEY — determines if they're serious)
5. "When are you looking to move in? This month, next few months, or just exploring?"
6. Get their NAME naturally: "By the way, what's your name so I can personalize this for you?"
7. Get their EMAIL: "What's the best email to send you the details?"

IMPORTANT QUALIFYING BEHAVIORS:
- If they give a budget + timeline within first 5 messages → they're HOT
- If they only give property type but dodge budget → they're WARM
- If they stop responding after 2 messages → they're COLD
- ALWAYS call update_lead with every piece of info: name, email, budget, timeline, service_interest (property type + area)

CONVERSION STRATEGY:
- For HOT leads: Move fast. Offer specific viewing times immediately.
- For WARM leads: Build value. Share insights about the area. Create urgency ("prices in this area went up 8% last quarter").
- For COLD leads: Be helpful, not pushy. "No pressure at all. I'm here whenever you're ready."

OBJECTION HANDLING:
- "It's too expensive" → "I understand. Would you like me to show you options in a slightly different area that fit your budget better?"
- "I need to think about it" → "Of course! Take your time. I'll be here whenever you're ready. Can I send you the details by email so you have them?"
- "I'm just looking" → "That's great! The best deals go to people who start looking early. What's most important to you in a property?"
- "I'm working with another agent" → "No worries! If you ever want a second opinion or see what else is on the market, feel free to reach out anytime."

CLOSING MOVE: Always push toward a property viewing or consultation meeting.
When they're ready → check_calendar → present 2-3 time slots → book_appointment.
```

---

### PART 3: Onboarding → Auto-Attach Industry Prompt 🔴

**Current Bug**: Onboarding saves `business_type: 'real_estate'` but the prompt system looks for `industry: 'real-estate'`. The `industry` field on the tenant is never set during onboarding.

**Fix** (in onboarding API, step 0):

```typescript
// When business_type is saved, also set the industry field
const industryMap = {
  'real_estate': 'real-estate',
  'ecommerce': 'other',
  'saas': 'other',
  'services': 'other',
  'healthcare': 'medical',
  'education': 'other',
  'hospitality': 'other',
  'finance': 'other',
  'other': 'other',
};
if (data.business_type) {
  updates.industry = industryMap[data.business_type] || 'other';
}
```

This ensures that when someone selects "Real Estate" during onboarding, the AI automatically gets the full real estate prompt with all the qualifying questions, temperature rules, and objection handling.

---

### PART 4: Trial Period & Rate Limiting 🟡

**Database changes to `tenants` table:**

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_conversation_limit INTEGER DEFAULT 50;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS conversations_used_this_month INTEGER DEFAULT 0;
```

**How Trial Works:**

1. **On signup**: Set `subscription_status = 'trial'`, `trial_start_date = NOW()`, `trial_end_date = NOW() + 7 days`, `trial_conversation_limit = 50`
2. **On every inbound message** (in webhook): Check:
   - Is trial expired? → Send "Your trial has ended. Upgrade to continue: [link]" → skip AI
   - Is conversation limit reached? → Send "You've used all 50 trial conversations. Upgrade for unlimited: [link]" → skip AI
   - Otherwise: Process normally, increment `conversations_used_this_month`
3. **On upgrade** (manual for now): Set `subscription_status = 'active'`, increase limits

**Rate Limiting for Abuse Prevention:**
- Trial: Max 50 conversations, max 200 messages total
- Starter: Max 100 conversations/month
- Growth: Max 500 conversations/month
- Each conversation = 1 unique contact's 24-hour window

This is checked in the Twilio webhook before AI processing.

---

### PART 5: Demo/Landing Page Improvements 🟡

**Current state**: The `/realestate` page exists and is decent. It needs:

1. **Replace demo WhatsApp link** — currently points to Twilio sandbox. Should point to YOUR actual demo number.

2. **Add a "Pain Points" section** (before features):
   - "Your phone buzzes at 2 AM with a property inquiry. By the time you reply at 9 AM, that lead already contacted 3 other agents."
   - "You spend 60% of your time answering the same questions: What's the price? Is it available? Where is it located?"
   - "You close 20 deals a year but lose 200 leads. Not because your properties aren't good — because you're too slow."

3. **Add "How It Works" section** (3 simple steps):
   - Step 1: "Connect your WhatsApp" (15 min setup)
   - Step 2: "AI handles inquiries 24/7" (qualifies, books viewings)
   - Step 3: "You show up to viewings with pre-qualified buyers"

4. **Replace "Start Free Trial" CTA with "Book a Discovery Call"**:
   - Instead of sending them to signup (they need Twilio setup help), send them to a booking page
   - Use check_calendar → book_appointment on YOUR calendar
   - Or a simple Calendly link for now

5. **Add "Before/After" comparison**:
   ```
   WITHOUT SalesConcierge          WITH SalesConcierge
   ─────────────────────          ──────────────────────
   Reply in 4 hours          →    Reply in 5 seconds
   Lose 60% of leads         →    Capture 100% of leads
   5 viewings/week           →    15 viewings/week
   Work 12 hrs answering     →    AI handles 80% of chats
   ```

6. **Update pricing** to match GTM plan:
   - Pilot: $99/mo (100 conversations) — for testing
   - Starter: $299/mo (500 conversations) — solo agents
   - Growth: $799/mo (2000 conversations) — teams

7. **Add lead capture form** — Instead of just "Start Free Trial":
   - Name, email, phone, agency name
   - "Book Your Free Setup Call" button
   - This becomes YOUR lead pipeline

---

### PART 6: Onboarding Experience for New Clients 🟡

**How you onboard a new real estate agent client:**

**Step 1: Discovery Call (15 min)**
- You ask: "How many WhatsApp leads do you get per month?"
- You ask: "How fast do you usually respond?"
- You show the demo (send message to demo number on the call)
- You agree on plan (Starter or Growth)

**Step 2: Setup (30 min — you do this for them)**
- Create their account (signup)
- Onboarding Step 1: Enter their company name, select "Real Estate"
  → System auto-attaches real estate prompt + temperature rules + follow-up sequences
- Onboarding Step 2: Help them set up Twilio WhatsApp Business
  → You walk them through getting a Twilio number + setting the webhook URL
- Onboarding Step 3: AI Config is pre-filled for real estate (greeting, personality)
  → They can customize the greeting
- Onboarding Step 4: Calendar — use in-app calendar (no external needed)
  → Set their business hours + availability
- Onboarding Step 5: Handoff notifications
  → Set their email + WhatsApp for hot lead alerts

**Step 3: Go Live**
- Test with a real message
- Agent sees it in dashboard
- Done — AI is handling leads

**What changes in code:**
- When industry = "real-estate" is selected, auto-populate:
  - AI greeting: "Hi! 👋 Welcome to {{company_name}}. I'm here to help you find the perfect property. What type of home are you looking for?"
  - Follow-up sequences: Auto-create the warm/cold templates from Part 1
  - Availability settings: Auto-create default (Mon-Fri 9-6, Sat 10-2)
  - Calendar should be visible by default (skip asking about Calendly)

---

## Implementation Order

| Step | What | Files Changed | Effort |
|---|---|---|---|
| **1** | Fix onboarding → auto-set `industry` | `api/onboarding/route.ts` | 15 min |
| **2** | Enhanced real estate AI prompt | `lib/ai/prompts.ts` | 30 min |
| **3** | Follow-up sequences DB migration | `supabase/migrations/` | 20 min |
| **4** | Follow-up scheduling logic (on conversation idle) | `lib/services/followup.ts` | 1 hr |
| **5** | Follow-up processor (CRON endpoint) | `api/followups/process/route.ts` | 45 min |
| **6** | Auto-create follow-up templates on onboarding | `api/onboarding/route.ts` | 30 min |
| **7** | Trial period fields + enforcement in webhook | `webhook/twilio/route.ts` + migration | 45 min |
| **8** | Update demo page (pain points, CTA, pricing) | `app/realestate/page.tsx` | 1 hr |
| **9** | Add lead capture form + discovery call booking | `app/realestate/page.tsx` + API | 30 min |
| **10** | Test everything end-to-end | `tests/` | 30 min |

**Total estimated time: ~6 hours of focused work**

---

## What the Complete Lead Lifecycle Looks Like After This

```
1. PROSPECT sees your ad / landing page
   └── Books discovery call OR messages demo WhatsApp
   
2. ONBOARDING (you set them up in 30 min)
   └── Industry = Real Estate → auto-configures everything
   
3. LEAD ARRIVES on WhatsApp
   └── AI responds in 5 seconds
   └── AI qualifies: type, area, budget, timeline, name, email
   └── AI classifies temperature: hot / warm / cold
   └── AI calls update_lead with every detail
   
4. HOT LEAD (score ≥ 70)
   └── AI immediately offers viewing times
   └── AI books appointment
   └── Dashboard alert to agent: "Hot lead booked for Tuesday 2pm"
   └── Lead temperature → "booked"
   
5. WARM LEAD (score 30-69)
   └── AI tries to offer viewing
   └── Lead says "I'll think about it"
   └── AI says "No problem! I'll check in soon with new options"
   └── System schedules follow-ups:
       ├── Day 3: "Still thinking about that apartment in Marina?"
       ├── Day 7: "New listings just dropped in your area!"
       └── Day 21: "Just checking in. Here whenever you're ready"
   └── If lead replies → AI re-engages → tries to book again
   └── If lead books → all follow-ups cancelled
   
6. COLD LEAD (score < 30)
   └── AI stays friendly, no pressure
   └── System schedules lighter follow-ups:
       ├── Day 7: "We have some new options available"
       └── Day 21: "Reminder: we're here whenever you're ready"
   └── If lead replies → treated as new conversation → re-qualify
   
7. BOOKED LEAD
   └── Appointment confirmed
   └── Agent shows the property
   └── Agent marks outcome in dashboard (converted / no-show / follow-up)
   
8. CONVERTED → Deal closed 🎉
   
9. LOST → Stays in database for future re-engagement campaigns
```

---

## Approval Request

**Please confirm:**
1. ✅ Build the automated follow-up system (3/7/21 day sequences)?
2. ✅ Enhance the real estate AI prompt with temperature rules + objection handling?
3. ✅ Fix onboarding to auto-attach industry prompt?
4. ✅ Add trial period enforcement + rate limiting?
5. ✅ Update the `/realestate` demo page with pain points + discovery call CTA?
6. ✅ Auto-configure everything for real estate on onboarding?

Once you approve, I'll build all 6 parts in the order listed above.
