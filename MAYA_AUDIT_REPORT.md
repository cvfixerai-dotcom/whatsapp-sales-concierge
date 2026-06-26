# Maya — WhatsApp AI Sales Concierge: Full System Audit

Audited against the 10-layer specification. Every claim below was verified by reading the actual source files in this repository — not inferred from naming or assumed from the spec.

---

## Layer 1 — Inbound Webhook / Twilio Trigger

**Status: COMPLETE**

**What was found:**
`src/app/api/webhook/twilio/route.ts` implements a fast-ack pattern: it looks up the tenant by `twilio_whatsapp_number`, verifies the Twilio signature with `twilioService.verifyWebhookSignatureWithToken()`, records the event in `webhook_events` keyed by `messageSid` for idempotency, returns a 200 TwiML response in well under Twilio's timeout, and defers the actual work (`processInboundMessage()`) to Next.js's `after()` background-execution hook. Inside the background path it upserts the contact and conversation, enforces tenant usage limits, sends a canned first-message greeting without invoking the AI, and explicitly skips AI processing when the conversation status is `human-handling`, `human-handled`, or `handoff-requested` — i.e., the webhook itself respects human takeover state. A GET handler exists for health-checking which tenants are configured.

**Gaps:** None structural. Signature verification silently downgrades to "allow" if a tenant has no `twilio_auth_token` stored yet (logged as a warning) — this is a deliberate trade-off for onboarding, not an oversight, but it is a live security gap for any tenant in that state.

**Concerns:** The fallback signature-verification method in `twilio.ts` (`verifyWebhookSignature`, non-tenant version) returns `true` (allow) whenever no global auth token or no signature is present — convenient for development, dangerous if any code path still calls it in production instead of the tenant-aware version.

**Recommendations:** Require `twilio_auth_token` at tenant-creation time so the unverified-webhook window never exists in production. Remove or clearly gate the global `verifyWebhookSignature` fallback so it can't accidentally be wired into a production path.

---

## Layer 2 — Redis Conversation State

**Status: DIFFERENT FROM SPEC**

**What was found:**
The spec assumes Redis holds conversation/session state. It does not. `src/lib/queue/redis.ts` (`RedisQueue`) is a job queue — `lpush`/`rpop`, a dead-letter queue, retry with exponential backoff, and queue stats. The only thing genuinely live in production is `src/lib/services/rate-limiter.ts`, which lazily uses Redis purely for per-second/day/month WhatsApp send-rate limiting, with graceful degradation if Redis is unavailable. Actual conversation history lives in Supabase's `messages` table (last 20 messages loaded per turn), and the "is a human handling this" flag is the `conversations.status` enum in Postgres, not a Redis key.

A second implementation, `src/lib/queue/workers/message-processor.ts`, polls the queue with `setInterval(..., 100)` — incompatible with Vercel's serverless model — and re-implements contact/conversation upsert logic that duplicates (and doesn't match) the webhook route's own logic. The only place that starts this worker, `src/app/api/workers/start/route.ts`, is not called anywhere else in the codebase. This is strong evidence of a legacy, disconnected pipeline still sitting in the repo.

`AIAgent.requestHumanHandoff()` in `agent.ts` also pushes to this Redis queue, but it is never called — the live handoff path goes through `checkHandoffTriggers()` + `notifyHandoffRequest()` instead, which writes directly to Postgres.

**Gaps:** No Redis-backed session/state layer exists as the spec describes. The actual state store is Postgres.

**Concerns:** Dead code (the polling worker, the unused `requestHumanHandoff` Redis path, the unreached `/api/workers/start` route) adds real maintenance and onboarding risk — someone could plausibly trigger `/api/workers/start` in production and run a second, inconsistent message-processing pipeline alongside the live webhook flow.

**Recommendations:** Either delete the legacy queue-worker code path entirely or clearly mark it experimental/disabled. Document that Redis's actual role in production is rate limiting only, so future engineers don't assume it holds conversation state.

---

## Layer 3 — Claude AI Reasoning Engine, System Prompt, Lead Scoring

**Status: PARTIAL**

**What was found:**
`src/lib/ai/agent.ts` is the central orchestrator (`AIAgent` / `aiAgent` singleton). `loadContext()` pulls tenant, contact, conversation, last 20 messages, and any tenant-custom prompt in parallel. `callAI()` hardcodes a single provider — Claude Sonnet 4 (`claude-sonnet-4-20250514`), temperature 0.7, max 1000 tokens — with no OpenAI/Anthropic fallback despite a provider abstraction existing elsewhere in the code; on error it returns a fallback object rather than throwing. Tool calls support up to two levels of recursive follow-up AI calls.

There are **two** prompt-building systems in this codebase:
1. `src/lib/ai/prompts.ts` — a rich, 665-line, real-estate-aware "closer" sales prompt with per-industry overlays, detailed qualifying sequences, objection handling, a 9-step booking flow, and a weighted `calculateLeadScore()` (budget 0.3, timeline 0.25, location 0.2, decision_maker 0.25 for real estate).
2. `src/lib/ai/prompt-simple.ts` — a ~30-line generic prompt (`buildSimplifiedPrompt`), with no industry awareness at all.

`agent.ts` imports `buildSystemPrompt` from `prompts.ts` at the top of the file, but its own private method of the same name shadows that import and is what actually gets called — and that private method calls `buildSimplifiedPrompt()`. **The rich real-estate prompt in `prompts.ts` is not reachable from the live message-processing path.** Every customer conversation, real-estate or otherwise, is driven by the generic 30-line prompt, with only the tenant's stored custom greeting/system-prompt override (if any) layered on top.

Lead scoring has a similar split: `update-lead.ts` imports `calculateLeadScore` from a different file, `./calculate-score.ts` (not the `prompts.ts` weighted version), and that updater only ever populates `responses.budget`, `timeline`, and `interest_level` on contacts — `location` and `decision_maker`, which the real-estate weighting in `prompts.ts` treats as 45% of the score, are never populated anywhere in the live flow.

**Gaps:** The real-estate-specific system prompt is dead code from the AI's perspective. No `property_type`/`location` data is ever captured as structured lead data (also true at the schema level — see Layer 6). Single-provider AI with no fallback.

**Concerns:** This is the highest-impact gap in the whole system. A real-estate agency demoing this product would reasonably expect Maya to ask property-specific qualifying questions (budget, location, property type, decision-maker status) — instead, the live prompt is industry-agnostic and will read as generic to anyone who's seen the marketing material describing real-estate-specific behavior.

**Recommendations:** Decide deliberately whether `prompts.ts` or `prompt-simple.ts` is the production prompt, then delete the other (or wire the rich one in if real-estate behavior is the actual goal). Add `location`/`property_type` as first-class contact fields end-to-end (schema → tool → prompt) if real-estate qualification depth matters for the use case. Reconcile the two `calculateLeadScore` implementations into one canonical scorer.

---

## Layer 4 — Qualification Stage Machine

**Status: DIFFERENT FROM SPEC**

**What was found:**
`src/lib/ai/state-manager.ts` implements a deterministic, code-level state machine — not prompt-driven inference. `determineConversationState()` is a priority-ordered cascade across 8 states: `first_greeting`, `email_collected`, `post_booking`, `offering_slots`, `ready_to_book`, `qualifying`, `needs_name`, `general_chat`. Each state returns an explicit `allowedTools`/`blockedTools` list and a `promptAddendum` string injected into the (simplified) system prompt. This is a genuinely solid piece of engineering — it gates tool access at the code level so the AI can't, for example, call `book_appointment` before `check_calendar` has actually offered slots that match.

**Gaps:** This state machine is generic-industry, not real-estate-specific. The spec's implied stages (e.g., distinct location/property-interest stages) don't exist as separate states — they're folded into the generic `qualifying` state.

**Concerns:** None beyond the Layer 3 finding that this otherwise-solid state machine is feeding a generic, not industry-aware, prompt.

**Recommendations:** If real-estate-specific qualification stages are required, extend this state machine (it's well-structured for that) rather than relying on prompt content alone.

---

## Layer 5 — Google Calendar / Google Meet Integration

**Status: COMPLETE**

**What was found:**
`src/lib/services/calendar/google.ts` (`GoogleCalendarProvider`) implements OAuth2 refresh-token-based auth, `checkAvailability()` against a 14-day `freeBusy` window with local slot generation respecting tenant business hours, `bookAppointment()` which creates a calendar event with `conferenceData.createRequest.conferenceSolutionKey.type='hangoutsMeet'` — confirming Google Meet links are genuinely auto-generated — and `cancelAppointment()`.

The actual booking architecture is dual-write: `src/lib/ai/tools/book-appointment.ts` treats Supabase (`appointments` table, via `bookSlot()` in `inapp.ts`) as the canonical, always-required write. Google Calendar event creation is a separate, optional, explicitly non-fatal secondary step, gated on `tenant.calendar_provider === 'google'` and the tenant having a stored refresh token and calendar ID. The tool also does a careful two-tier conflict check before booking (cross-contact collision rejected; same-contact same-slot is idempotent; same-contact different-slot cancels-and-rebooks), and validates that the AI passed an exact ISO datetime matching one of the slots it was actually just offered — no global slot-search fallback, which prevents hallucinated bookings.

**Gaps:** None functionally — this layer is well-built.

**Concerns:** `tenants.google_refresh_token` and `google_calendar_id` are stored as plain TEXT in the schema (comment says "store encrypted" but no encryption call site exists — see Layer 6/9). A leaked database dump would expose live Google Calendar access for every tenant using that provider.

**Recommendations:** Apply the `pgcrypto` encryption functions that already exist in the schema (currently unused) to `google_refresh_token` and `twilio_auth_token` before storing them.

---

## Layer 6 — Supabase DB Schema

**Status: PARTIAL**

**What was found:**
`src/lib/db/schema.sql` plus migrations define 11+ base tables (`tenants`, `users`, `contacts`, `conversations`, `messages`, `appointments`, `ai_prompts`, `webhook_events`, `conversation_usage`, `rate_limits`, `audit_logs`) plus later-added tables (`handoff_events`, `availability_settings`, `blocked_slots`, `notifications`, `notification_logs`, `handoff_logs`, billing tables). Row Level Security is enabled and tenant-scoped (`tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())`) on essentially every table. `contacts.needs_human` (boolean) and `conversations.status` (the de facto human-takeover flag, an enum rather than boolean but functionally equivalent) are both real and used throughout the live code, not aspirational.

**Gaps:** No `property_type`, `location`, or `preferred_locations` columns exist anywhere on `contacts` — confirmed structural gap for the real-estate use case (matches the Layer 3 finding that this data is never captured in the AI flow either). `budget_range` is a single TEXT field, not a structured min/max range. No `agents` table exists as a distinct entity (agents are just `users` with a role) — naming difference from the spec, not a functional gap.

**Concerns:** `availability_settings` and `blocked_slots` (added in the in-app calendar migration) use "service role full access" RLS policies rather than tenant-scoped policies — a narrower attack surface than a missing-RLS table, but worth confirming this is intentional (service-role-only access, never exposed to anon/authenticated roles) rather than an oversight. `encrypt_sensitive_data()`/`decrypt_sensitive_data()` pgcrypto functions are defined but have no confirmed call site anywhere in the application code — dead/aspirational security infrastructure.

**Recommendations:** Add real-estate-specific structured fields if that vertical is the actual target market. Verify the service-role-only RLS tables are never queried with the anon/publishable key from client code. Either wire up or remove the unused encryption functions.

---

## Layer 7 — Operator Dashboard

**Status: COMPLETE**

**What was found:**
This is one of the most fully-built layers. `src/app/dashboard/conversations/[id]/page.tsx` is a real WhatsApp-styled live chat viewer: it polls `/api/conversations/[id]` every 4 seconds, merges in optimistic local messages, shows AI vs. human vs. contact bubbles with timestamps and handoff-trigger badges, displays lead score/temperature/budget/timeline, supports inline temperature editing and note-taking, and has a working **Take Over** button (`handleTakeOver`) that PATCHes `conversations.status` to `human-handling` and back to `active` — verified end-to-end against `src/app/api/conversations/[id]/route.ts`, which actually performs that update scoped to the session user's tenant. Once in human mode, the input field unlocks and sends real outbound messages via `/api/conversations/reply`; while in human mode the UI also surfaces simple keyword-based suggested responses.

`src/app/dashboard/handoffs/page.tsx` is a working handoff queue: stats cards (total/pending/in-progress/resolved/avg response time/escalated), filters, a claim action wired to `/api/handoffs/claim` (which enforces that an agent can only claim for themselves, verified server-side), and a resolve modal wired to `/api/handoffs/resolve`. It also subscribes to Postgres realtime changes on `conversations` to auto-refresh.

Dashboard routes are gated by `src/middleware.ts`, which uses Supabase SSR session cookies and redirects unauthenticated users to `/auth/login`; public paths (marketing pages, webhooks, signup, health checks) are explicitly allowlisted.

**Gaps:** None significant for the core take-over/conversation-view/handoff-queue functionality the spec asks about.

**Concerns:** See Layer 10 — the handoffs queue page reads from `conversations.handoff_*` columns, while a separate, more sophisticated multi-channel notification system (`handoff_events` table, `HandoffService`) writes data the dashboard UI never reads back. Functionally harmless today (the UI works), but it means half of the handoff infrastructure is write-only.

**Recommendations:** None for core dashboard functionality — it works and is well-built. See Layer 10 for the handoff-system consolidation recommendation.

---

## Layer 8 — Outbound Twilio Messaging

**Status: COMPLETE**

**What was found:**
`src/lib/services/twilio.ts` (`TwilioService`) fetches each tenant's own `twilio_account_sid`/`twilio_auth_token`/`twilio_whatsapp_number` per-send (genuine per-tenant credential isolation, not a shared account), checks rate limits via `rateLimiter` before sending (with automatic requeue-with-delay on rate-limit hit), retries failed sends up to 3 times with exponential backoff, and deliberately does **not** retry on Twilio error codes 21610 (unsubscribed), 21612 (account suspended), or 21614 (incapable number) — a sensible distinction between transient and permanent failures. It also implements webhook idempotency helpers (`storeWebhookEvent`, `isWebhookProcessed`, `markWebhookProcessed`) used by the Layer 1 webhook route.

**Gaps:** None functional.

**Concerns:** The class also exposes a tenant-agnostic `verifyWebhookSignature()` that defaults to `return true` (allow) whenever no auth token or no signature is present — this is the same fallback flagged in Layer 1. It exists alongside the safer tenant-aware `verifyWebhookSignatureWithToken()` and is not currently called by the live webhook route, but its presence is a footgun for future changes.

**Recommendations:** Remove the permissive fallback signature method, or make it throw/fail-closed instead of fail-open, so it can't be accidentally reintroduced into a production code path.

---

## Layer 9 — Multi-Tenancy Architecture

**Status: COMPLETE**

**What was found:**
Tenant isolation is enforced consistently: every dashboard API route resolves `tenantId` from the authenticated session (`getSessionUser()`) and scopes every Supabase query with `.eq('tenant_id', tenantId)`, on top of RLS as a second layer of defense at the database level. The webhook route resolves tenant identity from the inbound Twilio `To` number, not from any client-supplied value. `src/lib/services/tenant-initializer.ts` confirms genuine per-tenant setup: on tenant creation it seeds `availability_settings`, default business hours, and industry-specific default services/FAQs (real-estate, medical, automotive, home-services, other) — this is real, working multi-tenant onboarding logic, not a stub. Twilio and Google Calendar credentials are stored per-tenant (`tenants.twilio_auth_token`, `tenants.google_refresh_token`, etc.), not shared globally.

**Gaps:** None structural.

**Concerns:** Per-tenant secrets (`twilio_auth_token`, `google_refresh_token`) are stored as plain TEXT, repeating the Layer 5/6 encryption gap — a cross-tenant data breach (e.g., a SQL injection or leaked service-role key) would expose every tenant's third-party credentials at once, which is a more severe outcome in a multi-tenant system than in a single-tenant one.

**Recommendations:** Prioritize encrypting `twilio_auth_token` and `google_refresh_token` at rest specifically because of the multi-tenant blast radius — this is the single highest-leverage fix for reducing the impact of any future credential leak.

---

## Layer 10 — Human-in-the-Loop / Human-on-the-Loop Design Compliance (Cross-Cutting)

**Status: PARTIAL**

**What was found:**
HITL is implemented and functionally works, but through two overlapping, only-partially-integrated systems:

1. **`src/lib/handoff/detector.ts`** (`checkHandoffTriggers`) — a genuinely thorough multi-signal detector: low AI confidence (<70%), high-value lead heuristics, urgent timeline + high score, keyword matching (English and Arabic), repeated-topic detection across recent messages, negative sentiment, complex-query patterns, long messages, and rapid-fire message bursts. It combines these into a severity-weighted decision (`immediate_handoff` / `monitor` / `continue_ai`).
2. **`src/lib/handoff/notifier.ts`** (`notifyHandoffRequest`) — sets `conversations.status = 'handoff-requested'`, fetches active agents from `users`, and emails/SMS/in-app-notifies each one based on their individual `notification_preferences`. It also calls into a *second*, separately built system:
3. **`src/lib/services/handoff/index.ts`** (`HandoffService.triggerHandoff`) — writes a row to a distinct `handoff_events` table and fans out to channel-specific notifiers (dashboard, email, WhatsApp, Telegram) based on tenant-level `handoff_settings`, in parallel via `Promise.allSettled`.

Both systems run on every handoff and both write real data. But the dashboard's actual handoffs queue (`/api/handoffs/queue`, backing `src/app/dashboard/handoffs/page.tsx`) reads exclusively from `conversations.handoff_*` columns — it never queries `handoff_events`. The richer multi-channel system (#3) is fully wired for writing but **not connected to anything that reads it back** in the UI.

Once a human does take over, the system correctly suppresses the AI (verified in the Layer 1 webhook route: `human-handling`/`human-handled`/`handoff-requested` statuses all skip AI processing), and the Take Over / Hand Back to AI toggle in the conversation viewer (Layer 7) genuinely flips that status both ways.

**Gaps:** The `handoff_events`/`HandoffService` system is effectively a parallel, unread data store — duplicated effort with no payoff today. Escalation-on-timeout (`escalateHandoff()` in `notifier.ts`) exists as a function but there's no confirmed scheduled job (cron) calling it — it would need to be invoked externally to ever fire.

**Concerns:** Running two notification systems on every single handoff event means agents could receive duplicate emails (one from `notifier.ts`'s own per-agent loop, one from `HandoffService`'s `EmailNotifier` if email channel + recipient are configured) — worth confirming in a live test before a client demo.

**Recommendations:** Pick one handoff-tracking system as canonical (the `conversations.handoff_*` columns are what the working dashboard actually reads, so that's the pragmatic choice) and either retire `handoff_events`/`HandoffService` or migrate the dashboard to read from it instead — but not both indefinitely. Confirm whether `escalateHandoff()` is scheduled anywhere; if not, either wire it to a cron route or remove it to avoid implying a guarantee that doesn't exist.

---

## Overall System Assessment

**What's working well:** The core conversational loop — webhook in, AI reasoning, tool-gated state machine, booking with conflict checks, dual calendar write, operator takeover, outbound send with rate limiting — is real, connected, and reasonably defensive (idempotency keys, slot-conflict checks, non-fatal secondary writes, retry/backoff with permanent-failure detection). The operator dashboard, specifically the live conversation viewer and Take Over flow, is fully functional end-to-end, not a mockup. Multi-tenancy is consistently enforced through both RLS and explicit tenant-scoped queries. The handoff *detection* logic (keyword, sentiment, confidence, rapid-fire, repeated-topic heuristics) is unusually thorough for this stage of a product.

**The three most critical gaps:**
1. **The real-estate-specific system prompt and lead-scoring weights in `prompts.ts` are dead code** — every live conversation, regardless of industry, runs on the generic 30-line prompt in `prompt-simple.ts`, and `location`/`decision_maker` data (45% of the intended real-estate score weight) is never captured.
2. **No real-estate structured data model** — no `property_type`/`location` columns exist on `contacts` at all, so even if the rich prompt were wired in, there's nowhere to persist what it would extract.
3. **Two parallel, redundant handoff-tracking systems** (`conversations.handoff_*` vs. `handoff_events`/`HandoffService`), with the more sophisticated one not connected to the UI that operators actually use — wasted engineering effort and a duplicate-notification risk.

**The single highest-risk issue:** Plain-text storage of per-tenant third-party secrets (`twilio_auth_token`, `google_refresh_token`) in a multi-tenant database, with the schema's own encryption functions defined but unused. In a single-tenant app this is a bug; in a multi-tenant SaaS it's a one-breach-compromises-everyone exposure, and it's the kind of finding that shows up first in any serious security review a paying enterprise client might run before signing.

**Is the system ready to demo to a paying client?** Yes, for a generic appointment-booking WhatsApp concierge — that product is real, mostly well-engineered, and the demo flow (chat → qualify → book → calendar invite → operator takeover) will work as shown. No, if the pitch is specifically "real-estate AI sales concierge" — the real-estate-specific intelligence described in the codebase's own `prompts.ts` is not actually what talks to customers today, and a real-estate buyer who asks Maya about location or property type mid-demo will get generic responses, not the specialized behavior the code clearly intended to provide. Fix the prompt-wiring gap (Layer 3) before any real-estate-specific sales demo; treat the credential-encryption gap (Layer 9) as a pre-launch blocker rather than a demo blocker.
