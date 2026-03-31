# WhatsApp Sales Concierge - Prompt System Architecture

**Last Updated:** Feb 18, 2026

---

## Overview

The AI system uses a **3-layer prompt architecture** that combines at runtime:

```
┌─────────────────────────────────────────────────────────────┐
│                     FINAL AI PROMPT                         │
│                  (sent to Claude/GPT)                       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────┴────────┐  ┌──────────────────┐  ┌────────┴────────┐
│   LAYER 1:     │  │    LAYER 2:      │  │    LAYER 3:     │
│   Base Rules   │  │    Industry      │  │    Custom       │
│  (prompts.ts)  │  │    Context       │  │    Prompt       │
│                │  │  (prompts.ts)    │  │ (ai_prompts DB) │
└────────────────┘  └──────────────────┘  └─────────────────┘
```

---

## Layer 1: Base Rules (Universal)

**Location:** `/src/lib/ai/prompts.ts` → `CORE_RULES` (lines 12-124)

**Purpose:** Core rules that apply to ALL tenants, regardless of industry

**Contains:**
- Short message rules (2-3 sentences max)
- One question at a time
- Booking-focused behavior
- Language handling (English/Arabic)
- Tool usage instructions (`update_lead`, `check_calendar`, `book_appointment`)
- Calendar edge cases
- Human handoff rules
- Context awareness

**Example:**
```typescript
const CORE_RULES = `
ABSOLUTE RULES (never break these):
1. Keep EVERY message SHORT — max 2-3 sentences. This is WhatsApp, not email.
2. Ask ONE question at a time. Never stack questions.
3. Your #1 goal is to BOOK AN APPOINTMENT.
...
`;
```

**You CANNOT edit this per-tenant.** It's shared globally.

---

## Layer 2: Industry-Specific Context

**Location:** `/src/lib/ai/prompts.ts` → `INDUSTRY_CONTEXT` (lines 130-243)

**Purpose:** Qualification questions and strategies specific to each industry

**Available Industries:**
- `real-estate` — Property viewings, budget, area, timeline
- `automotive` — Vehicle type, new/used, test drives
- `home-services` — Service type, urgency, location
- `medical` — Appointment type, urgency, insurance
- `other` — Generic business

**Example for Real Estate:**
```typescript
'real-estate': `
LEAD TEMPERATURE CLASSIFICATION:
→ HOT: Specific budget + timeline (this month/ASAP)
→ WARM: Interested, has budget OR timeline
→ COLD: Just browsing, no timeline

QUALIFYING QUESTIONS (ask ONE at a time):
1. Property type: "What type of property?"
2. Area: "Which area or neighborhood?"
3. Buy or Rent: "Are you looking to buy or rent?"
4. Budget: "Entry-level, mid-range, or luxury?"
5. Timeline: "When are you looking to move?"
...
`;
```

**You CAN edit this globally** for all tenants in that industry, but **NOT per-tenant**.

---

## Layer 3: Custom Prompt (Per-Tenant)

**Location:** Database table `ai_prompts`
- `tenant_id` → Links to specific tenant
- `prompt_type` = `'system'`
- `is_active` = `true`
- `content` → Your custom instructions

**Purpose:** Business-specific instructions that override or extend base behavior

**Loaded at runtime:** `@/src/lib/ai/agent.ts:270-278`
```typescript
supabaseAdmin
  .from('ai_prompts')
  .select('content')
  .eq('tenant_id', tenantId)
  .eq('prompt_type', 'system')
  .eq('is_active', true)
```

**Your Demo Tenant's Custom Prompt:**
This is where your **two-phase meta-pivot** lives!

Created by: `/supabase/migrations/20240216_create_demo_tenant.sql` (lines 55-178)

**Contains:**
- Phase 1: Act as real estate AI (fake the calendar)
- Phase 2: Meta-pivot reveal (immediately after fake booking)
- Phase 3: Sell FixerAI (use real tools)
- Product knowledge (pricing, features)
- Follow-up rules

---

## How They Combine at Runtime

**Function:** `buildFullPrompt()` in `/src/lib/ai/prompts.ts:250-311`

```typescript
function buildFullPrompt(
  industry, companyName, services, businessHours, faqs, 
  contact, conversationHistory, customPrompt, aiAssistantName, agentDisplayName
): string {
  return `
    You are ${assistantName}, a sales assistant at ${companyName}...
    
    ${CORE_RULES}              // Layer 1: Base rules
    ${industryCtx}             // Layer 2: Industry-specific
    ${customSection}           // Layer 3: Custom from ai_prompts table ⭐
    ${servicesText}            // From tenant.services JSON
    ${faqsText}                // From tenant.faqs JSON
    ${hoursText}               // From tenant.business_hours JSON
    
    CURRENT LEAD STATUS:
    - Name: ${contact.name}
    - Email: ${contact.email}
    - Temperature: ${contact.temperature}
    ...
    
    RECENT CONVERSATION:
    ${conversationHistory}     // Last 20 messages
  `;
}
```

**Called by:** `/src/lib/ai/agent.ts:298-310` → `buildSystemPrompt()`

---

## What About AI_SYSTEM_PROMPT.md?

**Status:** ⚠️ **NOT CURRENTLY USED**

This file (`/AI_SYSTEM_PROMPT.md`) is a **standalone reference document** that was created to organize the prompt content, but it's **not wired into the system**.

The actual prompts come from:
1. `prompts.ts` (Layer 1 & 2)
2. `ai_prompts` database table (Layer 3)

**If you want to use `AI_SYSTEM_PROMPT.md`:**
You would need to:
1. Read the file content in `buildFullPrompt()`
2. Replace `CORE_RULES` and `INDUSTRY_CONTEXT` with the markdown content
3. Use it as a template

But currently, the system uses the `prompts.ts` hardcoded constants.

---

## Your Demo Tenant Configuration

**Table:** `tenants`
- `company_name`: "Dubai Elite Properties"
- `industry`: "real-estate"
- `ai_provider`: "anthropic"
- `ai_model`: "claude-sonnet-4-20250514"
- `ai_assistant_name`: "Sara"
- `agent_display_name`: "Ahmed"
- `language`: ["en", "ar"]
- `services`: JSON array with property types + FixerAI pricing
- `faqs`: JSON array with real estate + product questions
- `business_hours`: JSON with Dubai timezone hours

**Table:** `ai_prompts`
- `tenant_id`: [your demo tenant ID]
- `name`: "Demo Two-Phase Prompt"
- `prompt_type`: "system"
- `content`: Your full meta-pivot instructions (Phase 1 → 2 → 3)

---

## How to Edit Prompts

### Option A: Edit Global Base Rules (affects ALL tenants)
**File:** `/src/lib/ai/prompts.ts`
1. Edit `CORE_RULES` (lines 12-124) for universal changes
2. Rebuild: `npm run build`
3. Redeploy

### Option B: Edit Industry Context (affects all tenants in that industry)
**File:** `/src/lib/ai/prompts.ts`
1. Edit `INDUSTRY_CONTEXT['real-estate']` (lines 131-197)
2. Rebuild: `npm run build`
3. Redeploy

### Option C: Edit Custom Prompt (affects only your demo tenant)
**Database:** `ai_prompts` table

**Method 1 - SQL:**
```sql
UPDATE ai_prompts
SET content = 'YOUR NEW PROMPT HERE...',
    updated_at = NOW()
WHERE tenant_id = 'your-tenant-id'
  AND prompt_type = 'system'
  AND is_active = true;
```

**Method 2 - Dashboard (if built):**
Dashboard → Settings → AI Configuration → Custom Prompt

**Method 3 - Run Migration:**
Edit `/supabase/migrations/20240216_create_demo_tenant.sql` and re-run.

---

## Debugging Prompt Issues

### Check what prompt is actually being sent:

1. **Add logging to `buildFullPrompt()`:**
```typescript
// In /src/lib/ai/prompts.ts:311 (bottom of buildFullPrompt)
const finalPrompt = `...`.trim();
console.log('[DEBUG] Final prompt length:', finalPrompt.length);
console.log('[DEBUG] Has custom prompt:', !!customPrompt);
return finalPrompt;
```

2. **Check tenant's custom prompt in database:**
```sql
SELECT 
  t.company_name,
  t.industry,
  p.name,
  LENGTH(p.content) as prompt_length,
  p.is_active,
  p.updated_at
FROM tenants t
LEFT JOIN ai_prompts p ON p.tenant_id = t.id AND p.prompt_type = 'system'
WHERE t.company_name = 'Dubai Elite Properties';
```

3. **Test with a simple message:**
Send "Hi" to your demo WhatsApp number and check logs in:
- Vercel Functions logs
- Supabase logs
- Console output if running locally

### Common Issues:

**Issue 1: AI not following custom instructions**
- Check `ai_prompts.is_active = true`
- Check `ai_prompts.content` is not empty
- Check tenant_id matches

**Issue 2: AI breaking Phase 1 (using real calendar)**
- Custom prompt says "Do NOT call check_calendar" but AI is calling it
- Solution: Make the instruction more explicit in custom prompt

**Issue 3: AI not pivoting to Phase 2**
- Custom prompt says "trigger IMMEDIATELY" but AI waits
- Solution: Add trigger condition explicitly: "Right after confirming the fake booking, WITHOUT WAITING for customer reply, send the pivot message."

**Issue 4: Prompt too long (token limit)**
- Base rules: ~1,500 tokens
- Industry context: ~500 tokens
- Custom prompt: ~1,000 tokens
- Services/FAQs/Hours: ~500 tokens
- Conversation history: ~500 tokens
- **Total: ~4,000 tokens** (out of 200k context window)
- Not an issue unless you have 100+ FAQs or very long history

---

## Quick Reference: Where Everything Lives

| Component | Location | Editable Per-Tenant? |
|-----------|----------|---------------------|
| Base rules | `prompts.ts:12-124` | ❌ No (global) |
| Industry context | `prompts.ts:130-243` | ❌ No (global) |
| Custom prompt | `ai_prompts` table | ✅ Yes |
| Services list | `tenants.services` JSON | ✅ Yes |
| FAQs | `tenants.faqs` JSON | ✅ Yes |
| Business hours | `tenants.business_hours` JSON | ✅ Yes |
| Assistant name | `tenants.ai_assistant_name` | ✅ Yes |
| Agent name | `tenants.agent_display_name` | ✅ Yes |

---

## Testing Your Prompts

1. **Send test message to demo WhatsApp:**
   - Number: +1 409 908 3940
   - Say: "Hi, looking for a 2BR apartment in Marina"

2. **Observe AI behavior:**
   - Does it follow Phase 1 flow?
   - Does it fake the calendar (not call tools)?
   - Does it pivot immediately after fake booking?
   - Does it use real tools in Phase 3?

3. **Check logs:**
   - Vercel Dashboard → Functions → Filter by `/api/webhook/twilio`
   - Look for tool calls: `update_lead`, `check_calendar`, `book_appointment`

4. **Verify database updates:**
```sql
SELECT 
  c.name,
  c.temperature,
  c.service_interest,
  c.metadata,
  conv.updated_at as last_interaction
FROM contacts c
JOIN conversations conv ON conv.contact_id = c.id
WHERE c.whatsapp_number LIKE '%your_test_number%'
ORDER BY conv.updated_at DESC
LIMIT 1;
```

---

## Next Steps

If your AI is "breaking" during testing:

1. **Tell me exactly what's happening:**
   - What message did you send?
   - What did the AI respond?
   - What should it have done?
   - At what phase did it break? (1, 2, or 3)

2. **Share the conversation flow:**
   - Show me the WhatsApp message history
   - I'll identify where the prompt logic failed

3. **I'll help you fix it by:**
   - Adjusting the custom prompt in `ai_prompts` table
   - Modifying trigger conditions
   - Adding explicit phase markers
   - Improving instruction clarity

The system is working — we just need to tune the **Layer 3 custom prompt** to match your exact desired behavior.
