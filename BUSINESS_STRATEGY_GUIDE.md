# WhatsApp Sales Concierge — Business & Go-To-Market Strategy

**Last Updated:** February 15, 2026
**Demo Business:** Demo Miracle | **WhatsApp:** +1 409 908 3940 | **Email:** lordskempo@yahoo.com

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [System Architecture & Features](#2-system-architecture--features)
3. [Scale Recommendations](#3-scale-recommendations)
4. [System Capacity & Limits](#4-system-capacity--limits)
5. [Market Analysis](#5-market-analysis)
6. [Target Market Strategy](#6-target-market-strategy)
7. [Pricing Structure](#7-pricing-structure)
8. [Cost & Profit Analysis](#8-cost--profit-analysis)
9. [Go-To-Market: $50K–$100K in 4 Months](#9-go-to-market-50k100k-in-4-months)
10. [Sales Playbook](#10-sales-playbook)
11. [Marketing Channels](#11-marketing-channels)
12. [Client Education Strategy](#12-client-education-strategy)
13. [Demo Bot System](#13-demo-bot-system)
14. [Key Metrics & Milestones](#14-key-metrics--milestones)
15. [Risks & Mitigation](#15-risks--mitigation)
16. [Quick Reference](#16-quick-reference)

---

## 1. What This System Does

### One-Sentence Pitch
> "Never lose a WhatsApp lead again — our AI responds in seconds, qualifies buyers, and books viewings while you sleep."

### The Product
**WhatsApp AI Sales Concierge** is a multi-tenant SaaS platform that gives every business a 24/7 AI sales employee on WhatsApp. When a customer sends a message, the AI:

1. **Responds in under 5 seconds** — no lead goes cold
2. **Qualifies the lead** — asks the right questions (budget, timeline, preferences)
3. **Scores and classifies leads** — Hot, Warm, Cold temperature system
4. **Books appointments** — directly into the agent's calendar
5. **Hands off to humans** — one-click takeover when needed, with email/WhatsApp/Telegram alerts
6. **Follows up automatically** — scheduled Day 3, Day 7, Day 21 nurture sequences
7. **Sends appointment reminders** — 2 hours and 30 minutes before bookings

### Who It's For
- Real estate agents and brokerages
- Medical/dental clinics
- Auto dealerships
- Education centers
- Any business that gets customer inquiries on WhatsApp

### Why It Matters
- **SMBs lose 60%+ of leads** due to slow response times
- **Leads contacted within 5 minutes** are 21x more likely to convert
- **Most agents take hours** to reply — the AI takes seconds
- **WhatsApp is #1** in Africa, Middle East, Latin America, South Asia

---

## 2. System Architecture & Features

### Core Components

| Component | Description | Key File |
|-----------|-------------|----------|
| **Twilio Webhook** | Receives inbound WhatsApp messages, routes to AI | `src/app/api/webhook/twilio/route.ts` |
| **AI Agent** | Anthropic Claude-powered, industry-trained conversations | `src/lib/ai/agent.ts` |
| **Lead Scoring** | Automatic temperature classification (Hot/Warm/Cold) | `src/lib/ai/tools/update-lead.ts` |
| **Follow-up Scheduler** | Day 3/7/21 automated nurture sequences | `src/lib/services/followup-scheduler.ts` |
| **Appointment Reminders** | 2hr + 30min reminders to leads and agents | `src/app/api/reminders/process/route.ts` |
| **Dashboard** | Web UI for managing leads, conversations, analytics | `src/app/dashboard/` |
| **Onboarding** | Multi-step tenant setup with auto-config | `src/app/api/onboarding/route.ts` |
| **Demo Bot** | Public demo for prospects to experience the AI | `src/app/api/webhook/demo/route.ts` |
| **Demo Landing Page** | Real estate-focused with live WhatsApp demo link | `src/app/realestate/page.tsx` |

### Features Built & Working

| Feature | Status | Details |
|---------|--------|---------|
| 24/7 AI responses (< 5 sec) | ✅ Built | Anthropic Claude, industry prompts |
| Lead qualification & scoring | ✅ Built | Temperature + score system |
| Appointment booking | ✅ Built | Calendar integration |
| Human handoff (dashboard, email, WhatsApp, Telegram) | ✅ Built | One-click takeover |
| Follow-up sequences (Day 3/7/21) | ✅ Built | Editable templates per tenant |
| Appointment reminders | ✅ Built | 2hr + 30min before |
| Trial period enforcement | ✅ Built | 7-day / 25 convo limit |
| Monthly rate limiting per tier | ✅ Built | Auto-enforced in webhook |
| Multi-language (EN + AR) | ✅ Built | AI speaks both |
| AI assistant name & agent display name | ✅ Built | Personalized introductions |
| Webhook idempotency | ✅ Built | No duplicate processing |
| Performance indexes | ✅ Built | Optimized DB queries |
| Demo bot with lead capture | ✅ Built | Reveals itself after 5 msgs |
| Real estate landing page | ✅ Built | Pricing, FAQs, WhatsApp CTA |

### Database Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant business configs, Twilio creds, AI settings |
| `users` | Dashboard users (owners, agents) |
| `contacts` | Leads with temperature, score, qualification status |
| `conversations` | 24-hour messaging windows |
| `messages` | All inbound/outbound messages |
| `appointments` | Booked viewings/meetings |
| `follow_up_sequences` | Editable nurture templates (warm/cold) |
| `scheduled_followups` | Per-contact scheduled messages |
| `appointment_reminders` | Reminder tracking (sent/pending/failed) |
| `webhook_events` | Idempotency and audit trail |
| `handoff_events` | Human takeover tracking |
| `demo_leads` | Prospects captured from demo bot |

---

## 3. Scale Recommendations

### When to Implement Each Optimization

| Recommendation | When | Status |
|----------------|------|--------|
| **Database indexes** | Before launch | ✅ Done |
| **Webhook deduplication** | Already implemented | ✅ Done |
| **Trial & rate limiting** | Already implemented | ✅ Done |
| **Follow-up CRON** | Before launch | ✅ Done |
| **Redis caching for tenant data** | After 50+ tenants | ⏳ Wait |
| **Message queue (Redis/BullMQ)** | After 100+ tenants | ⏳ Wait |

### Redis Caching (When Needed)

**Implement when:** 50+ active tenants and dashboard loading > 2s or DB CPU > 60%.

```typescript
const cachedTenant = await redis.get(`tenant:${tenantId}`);
if (cachedTenant) return JSON.parse(cachedTenant);

const tenant = await supabase.from('tenants').select('*').eq('id', tenantId).single();
await redis.setex(`tenant:${tenantId}`, 300, JSON.stringify(tenant.data));
```

**Impact:** 50-70% reduction in database queries. 2-4 hours to implement.

---

## 4. System Capacity & Limits

### Architecture Capacity

| Component | Free Tier | Paid Tier | Bottleneck |
|-----------|-----------|-----------|------------|
| **Supabase** | 500MB DB, 2GB BW | 8GB DB, 250GB BW | ~50 → 500-1000 tenants |
| **Twilio** | Per-tenant creds | Per-tenant creds | No shared limit |
| **Anthropic** | Rate limits | Higher limits | ~1000 req/min |
| **Vercel** | 100GB BW | 1TB+ BW | ~10K → 100K+ req/day |

### Capacity Estimates

| Stage | Tenants | Messages/Month | Infra Cost/Month |
|-------|---------|----------------|------------------|
| Early | 10-50 | 5K-25K | $50-100 |
| Growing | 50-200 | 25K-100K | $200-500 |
| Scale | 200-1000 | 100K-500K | $500-2000 |

**Key:** The system handles 100+ businesses on current architecture. For 500+, upgrade Supabase Pro ($25/mo).

---

## 5. Market Analysis

### Strengths

| Aspect | Rating | Why |
|--------|--------|-----|
| Problem-Solution Fit | ⭐⭐⭐⭐⭐ | WhatsApp is #1 in target markets |
| AI Timing | ⭐⭐⭐⭐⭐ | AI assistants now reliable for sales |
| Multi-tenant SaaS | ⭐⭐⭐⭐⭐ | Recurring revenue, scalable |
| Lead Qualification | ⭐⭐⭐⭐⭐ | Businesses pay premium for qualified leads |
| 24/7 Availability | ⭐⭐⭐⭐⭐ | Most SMBs can't afford round-the-clock staff |

### Market Reality
- WhatsApp Business API adoption growing 40%+ YoY
- AI chatbots market projected $15B by 2028
- Africa/MENA region underserved by existing solutions
- Dubai alone: 30,000+ registered agents, ~5,000 active brokerages

### Challenges & Mitigation

| Challenge | Mitigation |
|-----------|------------|
| SMBs don't understand AI | Demo bot — "Experience First" approach |
| Twilio setup complexity | Assisted onboarding included |
| Competition from Meta native | Focus on AI intelligence, not just automation |
| Price sensitivity | Free trial tier for testing |

---

## 6. Target Market Strategy

### Priority Tiers

**🎯 Tier 1: HIGH PRIORITY (Start Here)**

| Business Type | Why | Avg Deal Value | Willingness to Pay |
|---------------|-----|----------------|---------------------|
| Real Estate Agents | High-value leads, 24/7 response critical | $500-2000/sale | ⭐⭐⭐⭐⭐ |
| Medical/Dental Clinics | Appointment scheduling, after-hours inquiries | $100-500/visit | ⭐⭐⭐⭐⭐ |
| Auto Dealerships | Lead qualification, test drive booking | $1000-5000/sale | ⭐⭐⭐⭐⭐ |
| Education Centers | Course inquiries, enrollment, high volume | $200-2000/enrollment | ⭐⭐⭐⭐ |

**🎯 Tier 2: MEDIUM PRIORITY** — Fitness/gyms, beauty salons, legal services, event planners

**🎯 Tier 3: VOLUME PLAY** — E-commerce, restaurants, travel agencies

### Why Start With Real Estate

1. **High pain point** — lose deals if they don't respond in minutes
2. **High willingness to pay** — commission-based, clear ROI
3. **Clear use case** — inquiry → qualification → viewing booking
4. **Referral potential** — agents talk to each other
5. **Easy to demo** — "I booked 3 viewings while you slept"

### Ideal Customer Profile (ICP)
- Real estate agent or small brokerage (2-20 agents)
- Gets 20+ WhatsApp inquiries/month
- Already runs Facebook/Instagram/Google ads
- Based in Dubai, Abu Dhabi, or Sharjah
- Budget: $500-2000/month (trivial vs ad spend)

---

## 7. Pricing Structure

### Current Tiers (Updated Feb 2026)

| Tier | Monthly | Conversations | Per Convo | Ideal For |
|------|---------|---------------|-----------|-----------|
| **Free Trial** | $0 (7 days) | 25 | — | Try before you buy |
| **Starter** | $197/mo | 200/mo | $0.99 | Solo agents |
| **Growth** | $497/mo | 800/mo | $0.62 | Growing teams (4-10) |
| **Scale** | $997/mo | 2,500/mo | $0.40 | Brokerages & agencies |

**$0 setup fees. No contracts. Cancel with 30 days notice.**

### Features by Tier

| Feature | Free | Starter | Growth | Scale |
|---------|------|---------|--------|-------|
| 24/7 AI responses | ✅ | ✅ | ✅ | ✅ |
| Lead qualification & scoring | ✅ | ✅ | ✅ | ✅ |
| Follow-up sequences (Day 3/7/21) | ✅ | ✅ | ✅ | ✅ |
| Dashboard access | Basic | Full | Full | Full |
| Appointment booking | ❌ | ✅ | ✅ | ✅ |
| Appointment reminders | ❌ | ✅ | ✅ | ✅ |
| WhatsApp + Email handoff | ❌ | ✅ | ✅ | ✅ |
| Telegram handoff | ❌ | ❌ | ✅ | ✅ |
| Bilingual (EN + AR) | ❌ | ❌ | ✅ | ✅ |
| Multi-language (3+) | ❌ | ❌ | ❌ | ✅ |
| Multi-number support | ❌ | ❌ | ❌ | ✅ |
| API access | ❌ | ❌ | ❌ | ✅ |
| Support response | — | 24hr | 2hr | 30min |

### Why These Prices Work
- **ROI is obvious**: 1 extra closed deal ($6K+ commission) = 6-30x their investment
- **Free trial = zero friction**: agents start immediately
- **Monthly is sticky**: once leads flow through the system, they won't cancel
- **Competitors charge more**: Salesforce, HubSpot $150-300/user/mo with NO WhatsApp AI

---

## 8. Cost & Profit Analysis

### Cost Per Conversation

| Component | Cost | Notes |
|-----------|------|-------|
| Anthropic API | $0.05-0.10 | ~500-1000 tokens |
| Twilio WhatsApp | $0.005-0.05 | Per message |
| Supabase | $0.001-0.005 | DB storage/queries |
| Vercel | $0.001-0.005 | Compute/bandwidth |
| **Total** | **$0.06-0.17** | Conservative |

### Profit Margins by Tier

| Tier | Price | Convos | Revenue/Convo | Cost/Convo | Margin |
|------|-------|--------|---------------|------------|--------|
| **Starter** | $197 | 200 | $0.99 | $0.15 | **85%** |
| **Growth** | $497 | 800 | $0.62 | $0.12 | **81%** |
| **Scale** | $997 | 2,500 | $0.40 | $0.08 | **80%** |

### Monthly Profit Scenarios

| Scenario | Tenants | Mix | Revenue | Costs | Profit |
|----------|---------|-----|---------|-------|--------|
| **Early** | 10 | 5 Starter, 3 Growth, 2 Scale | $4,470 | $500 | **$3,970** |
| **Growing** | 50 | 20 Starter, 20 Growth, 10 Scale | $23,850 | $3,000 | **$20,850** |
| **Established** | 200 | 80 Starter, 80 Growth, 40 Scale | $95,280 | $12,000 | **$83,280** |

### Break-Even
Fixed costs: ~$100/mo (Supabase $25 + Vercel $20 + domain $5 + misc $50).
**Break-even: 1 Starter client covers all infrastructure.**

---

## 9. Go-To-Market: $50K–$100K in 4 Months

### Revenue Math

**Conservative ($50K in 4 months):**
```
Month 1:  8 Starter ($197) + 2 Growth ($497) = $2,570/mo
Month 2: 15 Starter + 5 Growth               = $5,440/mo
Month 3: 22 Starter + 10 Growth              = $9,304/mo
Month 4: 28 Starter + 15 Growth              = $12,971/mo
4-month total ≈ $30K + upsells to Scale ≈ $50K
```

**Aggressive ($100K in 4 months):**
```
Month 1:  5 Starter + 3 Growth + 2 Scale  = $4,470/mo
Month 2: 10 Starter + 8 Growth + 5 Scale  = $10,915/mo
Month 3: 15 Starter + 14 Growth + 8 Scale = $17,890/mo
Month 4: 20 Starter + 20 Growth + 12 Scale = $25,860/mo
4-month total ≈ $59K + upsells/annual deals ≈ $100K
```

**You need 30-50 paying clients in 4 months = 2-3 new clients/week.**

### Month-by-Month Execution

#### MONTH 1: Foundation & First 5 Clients ($7K-12K)

**Week 1-2: Launch Prep**
- Landing page at `/realestate` (✅ built)
- Demo WhatsApp number: +1 409 908 3940 (✅ configured)
- 2-minute demo video showing AI qualifying a lead + booking
- 5-slide pitch deck

**Week 1-2: Outreach (start immediately)**
- **LinkedIn**: 50 Dubai real estate agent connections/day
  > "Hey [Name], I noticed you're in Dubai real estate. Quick question — how fast do you typically respond to new WhatsApp inquiries? We built an AI that responds in 5 seconds, qualifies the buyer, and books viewings automatically. Want to see a 2-min demo?"
- **WhatsApp Groups**: Join 5-10 real estate agent groups. Add value first.
- **Instagram DMs**: Find agents posting property ads → DM about lead response time
- **Referral seed**: First 3 clients get 30% discount if they refer 2 agents

**Week 3-4: Close First Clients**
- 7-day free trial with their real WhatsApp number (killer move)
- 30-min onboarding call to configure AI + connect Twilio
- Goal: 5 paying clients by end of Month 1

| Activity | Volume | Conversion |
|----------|--------|------------|
| LinkedIn connections/day | 50 | 10% reply |
| Demos/week | 5-8 | 40% to trial |
| Trials/week | 2-3 | 70% to paid |

#### MONTH 2: Systemize & Scale to 13 Clients ($14K-17K)
- LinkedIn outreach continues (now with Month 1 testimonials)
- Case study: "Agent X went from 20% lead response to 100% — 12 extra viewings in first month"
- Facebook Ads: $500-1000 budget targeting Dubai real estate agents
- Partnership: approach 2-3 real estate training academies
- Brokerage upsell: individual agents → team deals (Growth/Scale)
- Referral program: "Refer an agent, get 1 month free"

#### MONTH 3: Accelerate & Expand ($18K-28K)
- Double down on best acquisition channel
- Increase ad spend to $2K-3K/month if converting
- Hire part-time sales closer (20% commission on first 3 months)
- Webinar: "How Dubai Agents Use AI to Book 3x More Viewings"
- Expand to automotive dealers and medical clinics
- Upsell existing clients hitting conversation limits

#### MONTH 4: Compound & Hit Target ($18K-34K)
- 25-35 active clients, strong testimonials, repeatable sales process
- Push annual plan discounts (20% off = cash upfront)
- Explore white-label for marketing agencies (they resell, you take 60%)
- Plan for first hires: customer success + sales

### What NOT to Build
❌ Property listings (agents have their own)
❌ CRM features (they use existing CRM)
❌ Email marketing
❌ Advanced analytics dashboards

✅ Only build what clients ask for: media sharing, better Arabic AI, daily summary emails

---

## 10. Sales Playbook

### The 30-Second Pitch
> "You know how you lose leads because you can't reply to WhatsApp fast enough? Our AI responds in 5 seconds, asks the right qualifying questions, collects their info, and books a viewing on your calendar — all automatically. You just show up. Want to see it work with your actual number?"

### Objection Handling

| Objection | Response |
|-----------|----------|
| "I don't trust AI with my clients" | "You see every message in real-time. One click and you're in the conversation. The AI is your first responder, not your replacement." |
| "Too expensive" | "How much is one closed deal worth? $6K? $20K? One extra deal/month = 10x your investment." |
| "My leads are special" | "We customize the AI for YOUR business — your areas, prices, style. Trained on your services, not generic scripts." |
| "I want to try first" | "7-day free trial on your real number. No results, no payment." |
| "I'll think about it" | "How many WhatsApp leads came in today that you haven't replied to? Every hour = colder leads." |

### Demo Script (5 minutes)
1. **Show the problem** (30s): "Check your WhatsApp. How many unread messages from potential clients?"
2. **Live demo** (2m): Message demo number. Watch AI respond, qualify, book.
3. **Dashboard** (1m): Show the lead with all info collected, appointment booked.
4. **Takeover** (30s): Show human handoff toggle — "You're always in control."
5. **Close** (1m): "Shall we set this up on your number? Takes 30 minutes."

---

## 11. Marketing Channels (Ranked by ROI)

### Tier 1: Free/Low Cost, High Impact (Start Week 1)

1. **LinkedIn Outreach** — #1 channel. 50 connections/day, personalize every message.
2. **WhatsApp Demo Number** — Let the product sell itself. Put number everywhere: landing page, LinkedIn, business card.
3. **Referral Program** — 1 month free per referral. Every happy client brings 2-3 more.
4. **Real Estate WhatsApp Groups** — Share lead response tips, build authority, introduce product.

### Tier 2: Paid, Scalable (Start Month 2)

5. **Facebook/Instagram Ads** — $500-2K/mo targeting real estate agents. Ad → Landing page → WhatsApp demo → Sales call.
6. **Google Ads** — $500-1K/mo. Keywords: "WhatsApp CRM real estate", "AI sales assistant Dubai"

### Tier 3: Authority (Month 3+)

7. **Real Estate Events** — RERA events, property expos, agent meetups. Demo live.
8. **YouTube/Content** — "How I automated my WhatsApp leads" tutorials.
9. **Agency Partnerships** — Marketing agencies resell. 40% to them, 60% to you.

---

## 12. Client Education Strategy

### The Problem
Some SMBs don't understand AI and are skeptical about automated responses.

### The Solution: "Experience First"
Instead of explaining AI, let them EXPERIENCE it.

| Strategy | How | Lead Capture |
|----------|-----|-------------|
| Live Demo Bot | WhatsApp demo on landing page | Phone number captured |
| Industry Demos | "See how a real estate AI handles inquiries" | Qualifies industry |
| ROI Calculator | "How many leads do you lose after hours?" | Pain point data |
| Case Study Videos | 60-sec before/after of actual conversations | Builds trust |

### Content Marketing Funnel
```
AWARENESS  → Blog: "Why 67% of WhatsApp leads go cold in 5 minutes"
INTEREST   → Demo: "Try our AI assistant right now on WhatsApp"
CONSIDER   → Case Study: "How [Agent] books 3x more viewings"
DECISION   → Free Trial: 7-day trial with their actual WhatsApp
```

### Key Messaging

| Don't Say | Do Say |
|-----------|--------|
| "AI-powered chatbot" | "24/7 sales assistant" |
| "Automated responses" | "Instant, personalized replies" |
| "Machine learning" | "Learns your business" |
| "Natural language processing" | "Understands your customers" |

---

## 13. Demo Bot System

### Overview
Public-facing AI demo that prospects message on WhatsApp to experience the product.

**Demo Number:** +1 409 908 3940
**Demo Business:** Demo Miracle
**Landing Page:** `/realestate`
**Webhook:** `/api/webhook/demo`

### Flow
```
1. Prospect visits /realestate
2. Clicks "Try Demo on WhatsApp"
3. Opens WhatsApp with demo number (+14099083940)
4. AI responds as real estate assistant (Sarah from Demo Miracle)
   - Answers property questions
   - Qualifies the "lead"
   - Offers to book a "viewing"
5. After 5 messages, AI reveals: "I'm a demo! Want this for YOUR business?"
6. Phone number captured as lead for YOUR sales follow-up
```

### Technical Files
- `src/lib/demo/demo-bot.ts` — Core demo bot logic
- `src/app/api/webhook/demo/route.ts` — Webhook handler
- `supabase/migrations/20240207_add_demo_leads.sql` — Lead storage

### Setup
```env
DEMO_TWILIO_ACCOUNT_SID=your_sid
DEMO_TWILIO_AUTH_TOKEN=your_token
DEMO_WHATSAPP_NUMBER=whatsapp:+14099083940
```
Configure Twilio webhook → `https://your-domain.com/api/webhook/demo`

---

## 14. Key Metrics & Milestones

### Weekly Metrics

| Metric | Month 1 | Month 4 |
|--------|---------|---------|
| Outreach messages/week | 250 | 250 |
| Demos booked/week | 5 | 10 |
| Trial signups/week | 2-3 | 4-5 |
| Paid conversions/week | 1-2 | 2-3 |
| Active clients | 5 | 25-35 |
| MRR | $2,500 | $15K-25K |
| Churn rate | <10% | <5% |

### Revenue Milestones
```
Week 4:  $7K-12K total   (5 clients)     — Proof of concept
Week 8:  $22K-29K total  (13 clients)    — Sales machine working
Week 12: $40K-57K total  (21 clients)    — Scaling
Week 16: $58K-92K total  (26-35 clients) — Target hit
```

---

## 15. Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Slow sales cycle | Medium | Free trial removes buyer risk. Live demo, not slides. |
| AI quality issues | Medium | Monitor daily. Fix prompts. Human handoff safety net. |
| Twilio costs | Low | Pass through to client. ~$0.05-0.10/convo is negligible. |
| Churn after Month 1 | Medium | Onboarding call, weekly check-ins, ROI reports. |
| Competition | Low | No direct competitor offers WhatsApp AI + calendar + handoff at this price in UAE. |
| WhatsApp API changes | Low | Twilio abstracts this. Stay compliant with opt-in rules. |

---

## 16. Quick Reference

### Pricing
```
Free Trial: $0     → 25 convos (7 days)
Starter:    $197/mo → 200 convos
Growth:     $497/mo → 800 convos
Scale:      $997/mo → 2,500 convos
```

### Target Markets
```
1. Real Estate Agents (start here)
2. Medical/Dental Clinics
3. Auto Dealerships
4. Education Centers
```

### Key URLs
```
Landing Page: /realestate
Demo Webhook: /api/webhook/demo
Main Webhook: /api/webhook/twilio
Dashboard:    /dashboard
Onboarding:   /onboarding
```

### API Routes
```
POST /api/webhook/twilio        — Inbound WhatsApp (Twilio)
GET  /api/webhook/twilio        — Health check
POST /api/followups/process     — CRON: send follow-ups
POST /api/reminders/process     — CRON: send reminders
GET  /api/followups/templates   — View follow-up templates
PUT  /api/followups/templates   — Edit templates
GET  /api/conversations         — List conversations
POST /api/conversations/reply   — Manual reply
GET  /api/leads                 — List leads
GET  /api/dashboard/stats       — Dashboard stats
```

### Demo Environment
```env
DEMO_WHATSAPP_NUMBER=whatsapp:+14099083940
DEMO_TWILIO_ACCOUNT_SID=your_sid
DEMO_TWILIO_AUTH_TOKEN=your_token
```

---

*The product is built. The money is in the selling.*

*Updated February 15, 2026*
