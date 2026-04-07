# WhatsApp Sales Concierge — Complete System Audit Report

**Date:** April 7, 2026  
**Auditor Role:** Full-Stack Engineer, UI Designer, System Tester  
**Scope:** End-to-end system audit from onboarding to live WhatsApp conversations

---

## TABLE OF CONTENTS

1. [System Summary](#1-system-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [CRITICAL BUGS (Must Fix Before Beta)](#3-critical-bugs)
4. [HIGH PRIORITY Issues](#4-high-priority-issues)
5. [MEDIUM PRIORITY Issues](#5-medium-priority-issues)
6. [LOW PRIORITY / Improvements](#6-low-priority-improvements)
7. [Security Audit](#7-security-audit)
8. [UI/UX Audit](#8-uiux-audit)
9. [Database Audit](#9-database-audit)
10. [AI Agent Audit](#10-ai-agent-audit)
11. [Onboarding Flow Audit](#11-onboarding-flow-audit)
12. [Beta Readiness Checklist](#12-beta-readiness-checklist)
13. [Recommended Action Plan](#13-recommended-action-plan)

---

## 1. SYSTEM SUMMARY

**What it is:** A multi-tenant SaaS platform that provides AI-powered WhatsApp sales agents for businesses. It automates lead qualification, appointment booking, and customer engagement via WhatsApp.

**Tech Stack:**
- **Frontend:** Next.js 15, React 18, TailwindCSS, shadcn/ui, Recharts
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL) with RLS
- **AI:** Anthropic Claude Sonnet 4 (primary, hardcoded)
- **Messaging:** Twilio WhatsApp Business API
- **Calendar:** Google Calendar API + In-app fallback
- **Email:** Resend API
- **Queue:** Upstash Redis
- **Payments:** Paystack

**Key Flows:**
1. **Onboarding:** Signup → Business Profile → Twilio Setup → AI Config → Calendar → Handoff
2. **Inbound Message:** WhatsApp → Twilio Webhook → AI Agent → Tool Execution → Response
3. **Booking:** Lead Qualification → Calendar Check → Slot Selection → Book Appointment → Email Confirmation

---

## 2. ARCHITECTURE OVERVIEW

```
Customer (WhatsApp)
       │
       ▼
Twilio Webhook (/api/webhook/twilio)
       │
       ├── Signature Verification
       ├── Tenant Lookup (by WhatsApp number)
       ├── Trial/Limit Check
       ├── Idempotency Check (webhook_events)
       ├── Get/Create Contact
       ├── Get/Create Conversation
       ├── Auto-Extract Data (budget, timeline, name, email)
       │
       ▼
AI Agent (agent.ts)
       │
       ├── Load Context (tenant, contact, conversation, messages)
       ├── Build System Prompt (prompts.ts + industry context + custom prompt)
       ├── Check Post-Booking State (30-min window)
       ├── Call Claude Sonnet 4 (anthropic.ts)
       │
       ├── Tool Execution Loop (up to 3 levels deep):
       │   ├── update_lead → Update contact record
       │   ├── check_calendar → Google Calendar / In-app
       │   ├── book_appointment → Create appointment + Google event
       │   ├── cancel_appointment → Cancel appointment
       │   └── send_email → Resend API
       │
       ├── Follow-up AI Call (with tool results)
       ├── Handoff Detection
       │
       ▼
Twilio (send WhatsApp reply)
```

---

## 3. CRITICAL BUGS (Must Fix Before Beta)

### 🔴 CRIT-1: Temperature Overwrite Race Condition

**Location:** `src/lib/ai/agent.ts` lines 969-987  
**Impact:** Temperature set by `book_appointment` ("booked") gets overwritten back to "warm"/"new"

**Root Cause:** After ALL tool execution completes, `agent.ts` calls `updateContactTemperature()` at line 434-437. This method uses the AI's `qualificationData.interestLevel` to set temperature — completely ignoring that `book_appointment` already set it to "booked" via `updateLead`.

```typescript
// agent.ts line 434 — RUNS AFTER book_appointment already set temperature='booked'
await this.updateContactTemperature(params.contactId, aiResponse.qualificationData);

// agent.ts line 969 — This OVERWRITES temperature based on AI's interest score
private async updateContactTemperature(...) {
  let temperature: string = 'cold';
  if (qualificationData.interestLevel > 80) temperature = 'hot';
  else if (qualificationData.interestLevel > 50) temperature = 'warm';
  // ❌ 'booked' is NEVER set here — it always gets overwritten!
  
  await supabaseAdmin.from('contacts').update({ temperature }).eq('id', contactId);
}
```

**Fix Required:**
- `updateContactTemperature()` must check if current temperature is "booked" and skip the update
- OR remove `updateContactTemperature()` entirely and rely only on `updateLead` tool calls
- This is THE reason temperature kept resetting to "new" after booking

---

### 🔴 CRIT-2: Post-Booking State Bypassed by Follow-up AI Call

**Location:** `src/lib/ai/agent.ts` lines 196-360  
**Impact:** After booking, the follow-up AI call can still call `check_calendar`

**Root Cause:** When `book_appointment` succeeds, the code at line 183 correctly generates a deterministic confirmation and skips the follow-up AI call. BUT — the NEXT incoming message (e.g., "Thank you") enters `processInboundMessage()` fresh. The post-booking detection at line 529-540 queries for a recent booking, and IF found, injects a warning. However, the AI still has `check_calendar` available as a tool. The warning is in the system prompt but the AI can still choose to call the tool.

**Fix Required:**
- When `hasRecentBooking` is true, REMOVE `check_calendar` and `book_appointment` from the tools array
- This makes it physically impossible for the AI to call those tools in post-booking state

---

### 🔴 CRIT-3: Duplicate `@ts-nocheck` Across All Files

**Location:** Every `.ts` and `.tsx` file starts with `// @ts-nocheck`  
**Impact:** Zero TypeScript type checking = silent bugs everywhere

TypeScript is your best defense against bugs like passing wrong parameters, missing required fields, and null pointer errors. With `@ts-nocheck`, none of these are caught at build time.

**Fix Required:** Remove `@ts-nocheck` from all files and fix type errors. This is a significant effort but critical for system stability.

---

### 🔴 CRIT-4: Twilio Signature Verification Bypassed in Production

**Location:** `src/lib/services/twilio.ts` lines 54-64  
**Impact:** Any attacker can send fake webhook requests to your API

```typescript
// If no auth token configured → allows ALL requests
if (!this.authToken) { return true; }
// If no signature in request → allows ALL requests  
if (!signature) { return true; }
```

The `TwilioService` constructor reads from `env.TWILIO_ACCOUNT_SID` — but this is the PLATFORM owner's Twilio credentials. In a multi-tenant system, each tenant has their OWN Twilio credentials stored in the `tenants` table. The signature verification should use the TENANT's auth token, not the platform's.

**Fix Required:**
- Fetch the tenant's `twilio_auth_token` and use it for signature verification
- Remove the fallback that allows requests with no signature in production

---

## 4. HIGH PRIORITY Issues

### 🟠 HIGH-1: Massive File Duplication in Root Directory

**Impact:** ~30 duplicate files (`filename 2.ext`) cluttering the repository  
**Examples:** `package 2.json`, `README 2.md`, `SYSTEM_AUDIT 2.md`, `.eslintrc 2.json`, etc.  
**Root Cause:** Likely macOS file duplication from iCloud sync or manual copy.

**Fix:** Delete all `* 2.*` files from root and subdirectories. They add ~2MB of dead weight and confuse tooling.

---

### 🟠 HIGH-2: `updateLeadScore()` Also Overwrites Contact Fields

**Location:** `src/lib/ai/agent.ts` lines 924-963  
**Impact:** After every AI response, this method overwrites `qualification_status` and `timeline`

```typescript
// This runs AFTER every AI response — can overwrite values set by tools
await supabaseAdmin.from('contacts').update({
  lead_score: newScore,
  qualification_status: newScore > 70 ? 'qualified' : 'unqualified', // ❌ Overwrites 'contacted' set by booking
  timeline: qualificationData.timeline, // ❌ Overwrites value set by update_lead
}).eq('id', contactId);
```

**Fix:** Only update `lead_score`. Don't touch `qualification_status` or `timeline` — those should only be set by explicit `update_lead` tool calls.

---

### 🟠 HIGH-3: Calendar Provider Default is "calendly" (Not Supported)

**Location:** Database `tenants.calendar_provider` default is `'calendly'::text`  
**Impact:** New tenants get `calendar_provider = 'calendly'` but the system only supports `google` and `inapp`

The `check-calendar.ts` tool checks for `google` and falls back to `inapp`. Calendly is never handled, so new tenants with default settings will always use the in-app calendar even if they want Google.

**Fix:** Change default to `'inapp'::text` in the database.

---

### 🟠 HIGH-4: No Email Service (Resend) API Key Validation

**Location:** `src/lib/ai/tools/send-email.ts`  
**Impact:** If Resend API key is missing, email sending fails silently with cryptic errors

**Fix:** Add startup validation that RESEND_API_KEY exists; return clear error message if not.

---

### 🟠 HIGH-5: Conversation History Includes Empty Messages

**Location:** `src/lib/ai/agent.ts` line 586-593  
**Impact:** The `formatHistory()` method includes messages with empty content (tool call placeholders), wasting AI context tokens

```typescript
// These empty messages get included in history:
// { sender_type: 'ai', content: '' }  ← tool call placeholder
```

**Fix:** Filter out messages with empty or whitespace-only content.

---

### 🟠 HIGH-6: No Google Calendar OAuth Flow in UI

**Location:** `src/app/onboarding/page.tsx` Step 3 (Calendar Setup)  
**Impact:** Users cannot connect Google Calendar through the UI. The `google_refresh_token` must be manually set in the database.

For beta clients, this is a dealbreaker. They need a "Connect Google Calendar" button that initiates OAuth2 flow and stores the refresh token.

**Fix:** Implement Google Calendar OAuth2 flow:
1. Add "Connect Google Calendar" button in Settings > Calendar
2. Redirect to Google OAuth consent screen
3. Handle callback, exchange code for tokens
4. Store refresh token in `tenants.google_refresh_token`

---

## 5. MEDIUM PRIORITY Issues

### 🟡 MED-1: Tool Call Depth Can Cause Infinite Loops

**Location:** `src/lib/ai/agent.ts` lines 279-360  
**Impact:** The system handles up to 3 levels of tool calls (initial → follow-up → second follow-up). There's no hard limit, and if the AI keeps calling tools, it could loop.

**Fix:** Add a `MAX_TOOL_DEPTH = 3` constant and refuse further tool calls beyond that depth.

---

### 🟡 MED-2: `formatHistory()` Sends Last 10 Messages, `buildSystemPrompt()` Uses Last 5

**Location:** `src/lib/ai/agent.ts` lines 524-527 and 586-593  
**Impact:** Inconsistent context window. The system prompt has a 5-message summary, but the actual history has 10 messages. This means the "CURRENT LEAD STATUS" in the prompt may be stale compared to what the AI sees in history.

**Fix:** Use the same window (10 messages) for both, or remove the history from the system prompt entirely since it's already in the messages array.

---

### 🟡 MED-3: `conversation_window_end` Never Set on Active Conversations

**Location:** `src/app/api/webhook/twilio/route.ts`  
**Impact:** The `CONVERSATION_WINDOW_HOURS = 24` constant is defined but never used to auto-close conversations. Old conversations accumulate.

**Fix:** Add conversation window expiry logic. When a conversation is older than 24 hours, close it and start a new one.

---

### 🟡 MED-4: No Rate Limiting on AI API Calls

**Location:** `src/lib/ai/agent.ts`  
**Impact:** A single tenant could burn through your entire Anthropic API budget by sending rapid messages. There's rate limiting on Twilio outbound but not on AI calls.

**Fix:** Add per-tenant AI call rate limiting (e.g., max 20 AI calls per minute per tenant).

---

### 🟡 MED-5: `detectHandoff()` Method is Dead Code

**Location:** `src/lib/ai/agent.ts` lines 844-876  
**Impact:** This method exists but is never called. The handoff detection at line 364 uses `checkHandoffTriggers()` from `handoff/detector.ts` instead.

**Fix:** Remove the dead `detectHandoff()` method to reduce confusion.

---

### 🟡 MED-6: Unreachable Code After `throw` in `callAI()`

**Location:** `src/lib/ai/agent.ts` lines 672-681  
**Impact:** Lines 672-681 (fallback response) can never execute because line 669 throws the error.

```typescript
} catch (error) {
  console.error('[AI Agent] Claude API call failed:', error);
  throw error; // ← Exits the function
}
// ↓ UNREACHABLE CODE
console.error('[AI Agent] AI provider failed');
const fallbackMessage = this.generateFallbackResponse(params.newMessage, params.language);
```

**Fix:** Move the fallback logic into the catch block instead of re-throwing.

---

### 🟡 MED-7: `autoExtractAndSave()` Can Overwrite AI Tool Updates

**Location:** `src/app/api/webhook/twilio/route.ts` lines 175-212  
**Impact:** Auto-extraction runs on EVERY inbound message and can overwrite values that were just set by `update_lead`. E.g., if the AI set `budget_range = "80k"` via tool, the auto-extractor might overwrite it.

**Fix:** Add a `last_updated_by` field or timestamp check to avoid overwriting tool-set values.

---

## 6. LOW PRIORITY / Improvements

### 🟢 LOW-1: No Automated Tests
No unit tests, integration tests, or E2E tests exist. For beta stability, add at minimum:
- Booking flow integration test
- Post-booking state test
- Tool execution test
- Webhook idempotency test

### 🟢 LOW-2: No Error Monitoring
No Sentry, LogRocket, or similar. Errors only show in Vercel logs which are hard to search. Add structured error monitoring for production.

### 🟢 LOW-3: No Webhook Retry Handling
If AI processing takes > 15 seconds, Twilio will retry the webhook. The idempotency check at line 57-67 uses `ilike` on JSONB which is slow. Consider using a dedicated idempotency column.

### 🟢 LOW-4: Hard-coded AI Model
`claude-sonnet-4-20250514` is hardcoded in `agent.ts` line 651. The `ai_model` field in `tenants` table is ignored. This should be configurable per tenant.

### 🟢 LOW-5: No Multi-Language System Prompts
The system prompt is entirely in English. For Arabic-speaking customers, the AI must internally translate, which wastes tokens and reduces quality. Consider dual-language prompts.

### 🟢 LOW-6: Conversation Polling (Not Realtime)
The conversations page polls every 5 seconds (`setInterval(5000)`). This is expensive and laggy. Use Supabase Realtime subscriptions instead.

---

## 7. SECURITY AUDIT

### 🔴 CRITICAL Security Issues

| # | Issue | Table/View | Severity |
|---|-------|-----------|----------|
| 1 | **RLS Disabled** | `follow_up_sequences` | 🔴 ERROR |
| 2 | **RLS Disabled** | `scheduled_followups` | 🔴 ERROR |
| 3 | **RLS Disabled** | `appointment_reminders` | 🔴 ERROR |
| 4 | **RLS Disabled** | `agency_leads` | 🔴 ERROR |
| 5 | **RLS Disabled** | `monthly_reset_trigger` | 🔴 ERROR |
| 6 | **RLS Disabled** | `google_calendar_webhooks` | 🔴 ERROR |
| 7 | **RLS Disabled** | `discovery_leads` | 🔴 ERROR |
| 8 | **RLS Disabled** | `handoff_events` | 🔴 ERROR |
| 9 | **RLS Disabled** | `onboarding_logs` | 🔴 ERROR |
| 10 | **SECURITY DEFINER View** | `conversation_summary` | 🔴 ERROR |
| 11 | **SECURITY DEFINER View** | `todays_outreach` | 🔴 ERROR |
| 12 | **SECURITY DEFINER View** | `billing_dashboard` | 🔴 ERROR |
| 13 | **SECURITY DEFINER View** | `dashboard_kpis` | 🔴 ERROR |
| 14 | **SECURITY DEFINER View** | `tenant_usage_stats` | 🔴 ERROR |
| 15 | **SECURITY DEFINER View** | `handoff_dashboard` | 🔴 ERROR |
| 16 | **Leaked Password Protection Disabled** | Auth | 🟡 WARN |
| 17 | **Overly Permissive RLS** | `availability_settings`, `blocked_slots` | 🟡 WARN |
| 18 | **12 Functions with Mutable Search Path** | Various | 🟡 WARN |

### Additional Security Concerns

- **Twilio auth tokens stored in plaintext** in `tenants` table. Should be encrypted at rest.
- **Google refresh tokens stored in plaintext** in `tenants` table. Should be encrypted.
- **No CORS configuration** on webhook endpoints.
- **API keys (Anthropic, Resend) are environment variables** — this is correct, but ensure they're not logged.

---

## 8. UI/UX AUDIT

### Dashboard (`/dashboard`)
- ✅ Clean KPI cards with metrics
- ✅ Charts (line, pie, bar) for analytics
- ✅ Recent conversations and bookings lists
- ❌ No empty state design — new tenants see blank charts
- ❌ No loading skeleton for charts (only for page load)
- ❌ `checkOnboardingStatus()` is an empty function (line 89-91)

### Conversations (`/dashboard/conversations`)
- ✅ Conversation list with temperature badges
- ✅ Search and filter
- ✅ Polling for updates (5s interval)
- ❌ 5-second polling is expensive — should use Supabase Realtime
- ❌ No pagination — will break with 100+ conversations

### Calendar (`/dashboard/calendar`)
- ✅ Calendar view with appointments
- ✅ Block time slots feature
- ❌ No Google Calendar sync status indicator
- ❌ No way to manually create appointments from UI
- ❌ No way to reschedule (only cancel)

### Settings (`/dashboard/settings`)
- ✅ Multiple tabs: AI, Calendar, Handoff, Team, Business, Integrations
- ✅ Calendar settings with availability editor
- ❌ No Google Calendar OAuth connect button (must be done manually)
- ❌ No Twilio credentials edit (can only set during onboarding)
- ❌ No way to test AI personality from settings

### Onboarding (`/onboarding`)
- ✅ 5-step wizard: Business → Twilio → AI → Calendar → Handoff
- ✅ Progress tracking
- ❌ Step 3 (Calendar) has no UI for connecting Google Calendar
- ❌ No validation on Twilio credentials before proceeding
- ❌ No "test connection" button for Twilio
- ❌ No preview of how the AI will respond

---

## 9. DATABASE AUDIT

### Tables (26 total)
Core tables are well-structured with proper FK relationships. Key observations:

| Table | Rows | RLS | Issues |
|-------|------|-----|--------|
| `tenants` | 2 | ✅ | Default `calendar_provider='calendly'` (unsupported) |
| `contacts` | ~20 | ✅ | OK |
| `conversations` | ~15 | ✅ | No auto-close logic |
| `messages` | ~200 | ✅ | OK |
| `appointments` | ~5 | ✅ | OK |
| `availability_settings` | 2 | ✅ | Overly permissive RLS |
| `follow_up_sequences` | 2 | ❌ | **RLS DISABLED** |
| `scheduled_followups` | 66 | ❌ | **RLS DISABLED** |
| `handoff_events` | 0 | ❌ | **RLS DISABLED** |
| `webhook_events` | ~100 | ✅ | Idempotency uses JSONB ilike (slow) |

### Missing Indexes
- `messages.conversation_id` + `created_at` (composite) — used in every message fetch
- `contacts.whatsapp_number` + `tenant_id` (composite) — used in every webhook
- `appointments.contact_id` + `status` + `created_at` — used in post-booking check

---

## 10. AI AGENT AUDIT

### Architecture: GOOD ✅
- 3-layer prompt system (Core Rules → Industry Context → Custom Prompt)
- Tool-based architecture (update_lead, check_calendar, book_appointment, etc.)
- Deterministic booking confirmations (not AI-generated)
- Anthropic Claude Sonnet 4 — excellent choice for tool use

### Critical Flow Issues Found:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Temperature overwritten after booking (CRIT-1) | 🔴 | **UNFIXED** |
| 2 | AI can still call check_calendar in post-booking state (CRIT-2) | 🔴 | **UNFIXED** |
| 3 | Empty messages in conversation history (HIGH-5) | 🟠 | Unfixed |
| 4 | updateLeadScore overwrites contact fields (HIGH-2) | 🟠 | Unfixed |
| 5 | System prompt is 3000+ tokens (expensive) | 🟡 | By design |
| 6 | Unreachable fallback code in callAI (MED-6) | 🟡 | Unfixed |

### Prompt Quality: GOOD ✅
- Well-structured with clear rules
- Post-booking state rules are explicit
- Industry-specific contexts are well-written
- Tool usage instructions are clear and mandatory

### Tool Execution: MOSTLY GOOD ✅
- Proper error handling with retries for calendar
- Deterministic booking confirmations
- Email validation prevents placeholder sends
- Missing: tool call depth limit

---

## 11. ONBOARDING FLOW AUDIT

### Current Flow:
```
Step 0: Business Profile → ✅ Works, saves to tenants
Step 1: Twilio Setup → ⚠️ No credential validation
Step 2: AI Configuration → ✅ Works, saves personality/greeting/questions
Step 3: Calendar Setup → ❌ No Google Calendar OAuth, calls initializeTenantDefaults()
Step 4: Handoff Setup → ✅ Works, saves notification preferences
→ Complete Onboarding → ✅ Sets setup_completed=true
```

### Issues:
1. **No Twilio validation** — User can enter invalid credentials and won't know until first message fails
2. **No Google Calendar connect** — Must be done manually via database
3. **Calendar step initializes defaults** but doesn't let user configure actual calendar
4. **No "test your AI" step** — User has no way to preview how the AI will behave before going live
5. **No WhatsApp number verification** — The `twilio_whatsapp_number` is used for tenant lookup but not validated

---

## 12. BETA READINESS CHECKLIST

| Category | Item | Status | Priority |
|----------|------|--------|----------|
| **AI Core** | Temperature not overwritten after booking | ❌ | 🔴 CRITICAL |
| **AI Core** | Tools removed in post-booking state | ❌ | 🔴 CRITICAL |
| **Security** | Twilio signature uses tenant credentials | ❌ | 🔴 CRITICAL |
| **Security** | Enable RLS on all 9 tables | ❌ | 🔴 CRITICAL |
| **Security** | Fix SECURITY DEFINER views | ❌ | 🟠 HIGH |
| **Database** | Fix calendar_provider default to 'inapp' | ❌ | 🟠 HIGH |
| **Database** | Add missing indexes | ❌ | 🟠 HIGH |
| **Onboarding** | Twilio credential validation | ❌ | 🟠 HIGH |
| **Onboarding** | Google Calendar OAuth flow | ❌ | 🟠 HIGH |
| **AI Core** | Don't overwrite lead score fields | ❌ | 🟠 HIGH |
| **AI Core** | Filter empty messages from history | ❌ | 🟠 HIGH |
| **Cleanup** | Delete duplicate files (30+ files) | ❌ | 🟠 HIGH |
| **Cleanup** | Remove @ts-nocheck from files | ❌ | 🟡 MEDIUM |
| **Monitoring** | Add error monitoring (Sentry) | ❌ | 🟡 MEDIUM |
| **Testing** | Add basic integration tests | ❌ | 🟡 MEDIUM |
| **UI** | Empty states for new tenants | ❌ | 🟡 MEDIUM |
| **UI** | Replace polling with Realtime | ❌ | 🟢 LOW |

---

## 13. RECOMMENDED ACTION PLAN

### Phase 1: Critical Fixes (Do NOW — 1-2 days)

1. **Fix CRIT-1:** Stop `updateContactTemperature()` from overwriting "booked" temperature
2. **Fix CRIT-2:** Remove calendar/booking tools when `hasRecentBooking` is true
3. **Fix CRIT-4:** Use tenant-specific Twilio auth tokens for signature verification
4. **Fix HIGH-2:** Stop `updateLeadScore()` from overwriting `qualification_status` and `timeline`
5. **Fix HIGH-3:** Change database default `calendar_provider` to `'inapp'`
6. **Fix HIGH-5:** Filter empty messages from conversation history
7. **Clean up:** Delete all duplicate `* 2.*` files

### Phase 2: Security Hardening (Before Beta — 2-3 days)

1. Enable RLS on all 9 unprotected tables
2. Fix 6 SECURITY DEFINER views
3. Enable leaked password protection in Auth settings
4. Fix mutable search_path on 12 functions
5. Add database indexes for performance

### Phase 3: Beta-Ready Features (1-2 weeks)

1. Google Calendar OAuth flow in Settings
2. Twilio credential validation in Onboarding
3. "Test your AI" preview feature
4. Error monitoring (Sentry)
5. Basic integration tests
6. Empty states for new tenant dashboard

### Phase 4: Polish (Ongoing)

1. Remove `@ts-nocheck` and fix TypeScript errors
2. Replace polling with Supabase Realtime
3. Add pagination to conversations list
4. Conversation auto-close after 24 hours
5. Per-tenant AI call rate limiting

---

## SUMMARY

The system architecture is **sound** and well-designed. The 3-layer prompt system, tool-based AI agent, and multi-tenant structure are all good foundations. The main issues are:

1. **Race conditions** — Multiple places in the code overwrite contact data that was just set by tools (temperature, qualification_status, timeline). This is the #1 cause of the AI behavior bugs you've been experiencing.

2. **Security gaps** — 9 tables without RLS, 6 SECURITY DEFINER views, Twilio signature verification bypass. These must be fixed before beta clients come onboard.

3. **Missing integrations** — Google Calendar OAuth and Twilio credential validation need UI flows. Currently both require manual database edits.

4. **Code hygiene** — `@ts-nocheck` everywhere, 30+ duplicate files, dead code, unreachable code paths.

**Bottom line:** Fix the 4 CRITICAL issues and the system will be significantly more reliable for beta. The architecture doesn't need a rewrite — it needs surgical fixes to the race conditions and security hardening.
