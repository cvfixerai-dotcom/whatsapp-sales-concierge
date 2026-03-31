# SYSTEM ARCHITECTURE AUDIT

## WhatsApp Sales Concierge — Complete Technical Reference

**Generated:** Auto-generated system audit  
**Purpose:** Enable a senior AI systems engineer to fully understand and debug this project without follow-up questions.

---

# 1. PROJECT OVERVIEW

## 1.1 What This System Does

A multi-tenant WhatsApp-based AI sales concierge that:
- Receives inbound WhatsApp messages via Twilio webhooks
- Processes them through an AI agent (Anthropic Claude or OpenAI GPT)
- Qualifies leads, books appointments, and manages follow-ups
- Provides a Next.js dashboard for calendar, conversations, leads, and analytics

## 1.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.1.11 (App Router) |
| Language | TypeScript (all files use `// @ts-nocheck`) |
| Database | Supabase (PostgreSQL + PostgREST) |
| Auth | NextAuth v4 with JWT strategy + Credentials provider |
| AI Providers | Anthropic (Claude), OpenAI (GPT) — switchable per tenant |
| Messaging | Twilio WhatsApp API |
| Email | Resend API (direct fetch, no SDK) |
| Queue | Upstash Redis (available but AI processing is inline) |
| Billing | Paystack (primary), Stripe (legacy) |
| UI | React 18, TailwindCSS v4, Lucide icons, Recharts |
| Deployment | Vercel |

## 1.3 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── calendar/          # appointments, availability, blocks, book, slots
│   │   ├── webhook/twilio/    # Twilio inbound webhook (main entry point)
│   │   ├── conversations/     # CRUD, reply, repair, reset
│   │   ├── handoffs/          # claim, queue, resolve
│   │   ├── leads/             # Lead management
│   │   ├── settings/          # ai-config, calendar, handoff, integrations, templates
│   │   ├── billing/           # subscribe, topup, usage
│   │   ├── analytics/         # Dashboard analytics
│   │   ├── followups/         # process, stale-conversations, templates
│   │   ├── auth/              # NextAuth + Google Calendar OAuth
│   │   ├── onboarding/        # Tenant setup + Twilio verification
│   │   └── ...
│   └── dashboard/
│       ├── calendar/          # Calendar page + availability settings
│       ├── conversations/     # Conversation list + detail
│       ├── leads/             # Lead management
│       ├── handoffs/          # Human handoff queue
│       ├── analytics/         # Analytics dashboard
│       ├── settings/          # Tenant settings
│       └── ...
├── lib/
│   ├── ai/
│   │   ├── agent.ts           # AIAgent singleton — orchestrates everything
│   │   ├── prompts.ts         # System prompt builder (industry-specific)
│   │   ├── auto-extract.ts    # Safety-net data extraction from messages
│   │   ├── providers/
│   │   │   ├── index.ts       # BaseAIProvider + factory
│   │   │   ├── anthropic.ts   # Anthropic Claude provider
│   │   │   └── openai.ts      # OpenAI GPT provider
│   │   └── tools/
│   │       ├── index.ts       # Tool registry + executeTool + getAvailableTools
│   │       ├── check-calendar.ts
│   │       ├── book-appointment.ts
│   │       ├── cancel-appointment.ts
│   │       ├── update-lead.ts
│   │       ├── calculate-score.ts
│   │       └── send-email.ts
│   ├── db/
│   │   ├── client.ts          # Supabase client (lazy proxy pattern)
│   │   ├── schema.sql         # Core schema
│   │   ├── handoff-schema.sql # Handoff tables + views
│   │   ├── billing-schema.sql
│   │   ├── dashboard-kpis.sql # KPI views + hourly stats
│   │   ├── ai-processing-logs.sql
│   │   ├── types.ts
│   │   └── migrate.ts
│   ├── services/
│   │   ├── calendar/
│   │   │   ├── inapp.ts       # PRIMARY: slot generation + booking
│   │   │   ├── index.ts       # Calendar service abstraction
│   │   │   ├── calendly.ts    # Calendly provider (external)
│   │   │   └── google.ts      # Google Calendar provider (external)
│   │   ├── followup-scheduler.ts
│   │   ├── followup-templates.ts
│   │   ├── rate-limiter.ts
│   │   └── handoff/           # Notification channels
│   ├── handoff/
│   │   ├── detector.ts        # Handoff trigger detection
│   │   └── notifier.ts        # Handoff notification dispatch
│   ├── auth.ts                # NextAuth configuration
│   ├── env.ts                 # Environment variable helper
│   └── ...
└── components/                # Shared UI components
```

## 1.4 Environment Variables

Defined in `src/lib/env.ts`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side, bypasses RLS) |
| `NEXTAUTH_URL` | NextAuth base URL |
| `NEXTAUTH_SECRET` | NextAuth JWT secret |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WEBHOOK_URL` | Twilio webhook URL (for signature verification) |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_FROM_EMAIL` | Resend sender email |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `PAYSTACK_SECRET_KEY` | Paystack billing |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for handoff notifications |

## 1.5 Multi-Tenancy Model

- Every row in the database has a `tenant_id` column
- RLS policies enforce tenant isolation via `auth.uid()` → `users.tenant_id`
- Server-side code uses `supabaseAdmin` (service role key, bypasses RLS)
- Dashboard API routes extract `tenantId` from NextAuth session: `session.user.tenantId`
- AI tools receive `tenantId` injected by `agent.ts` `executeTools()`

---

# 2. AI LAYER ARCHITECTURE

## 2.1 Entry Point: Twilio Webhook

File: `src/app/api/webhook/twilio/route.ts`

The POST handler is called by Twilio when a WhatsApp message arrives. Steps in order:

1. **Parse body** — URL-encoded form data from Twilio (`MessageSid`, `From`, `To`, `Body`)
2. **Verify Twilio signature** — uses `TWILIO_WEBHOOK_URL` env var to avoid proxy URL mismatch
3. **Find tenant** — looks up tenant by the WhatsApp number the message was sent TO
4. **Trial & limit check** — `checkTenantLimits()` verifies subscription status, trial expiry, and monthly conversation caps per tier (`free: 25`, `starter: 200`, `growth: 800`, `scale: 2500`)
5. **Idempotency** — checks `webhook_events` table for duplicate `MessageSid` via `ilike('payload->>messageSid', messageSid)`
6. **Store webhook event** — inserts raw payload into `webhook_events` with `processed: false`
7. **Get or create contact** — matches on `tenant_id` + `whatsapp_number` (stripped of `whatsapp:` prefix)
8. **Get or create conversation** — finds most recent non-closed conversation; repairs `is_active` flag if missing; creates new conversation if none found (closes old ones first)
9. **Save inbound message** — inserts into `messages` table with `direction: 'inbound'`, `sender_type: 'contact'`
10. **Auto-extract data** — `autoExtractAndSave()` runs regex patterns for email, phone, name as safety net when AI doesn't call `update_lead`; also `extractBudgetHints()` and `extractTimelineHints()`
11. **Skip AI if human-handled** — if `conversation.status` is `human-handling` or `human-handled`, message is saved but AI is not invoked
12. **AI processing (inline)** — calls `aiAgent.processInboundMessage()` synchronously
13. **Fallback on AI failure** — sends generic message via Twilio if AI throws
14. **Mark webhook processed** — updates `webhook_events.processed = true`
15. **Return TwiML** — always returns `200` with empty `<Response/>` XML to prevent Twilio retries

**Key design choice:** AI processing is **inline** (not queued). The webhook handler blocks until AI completes. This simplifies the architecture but means Twilio's timeout (~15s) constrains AI response time.

## 2.2 AIAgent Singleton

File: `src/lib/ai/agent.ts`

The `AIAgent` class is a singleton (`AIAgent.getInstance()`) exported as `aiAgent`. It orchestrates the full AI pipeline.

### processInboundMessage() Flow

```typescript
// Simplified flow from agent.ts

async processInboundMessage(params: ProcessMessageParams): Promise<void> {
  // 1. Load context (tenant, contact, conversation, recent messages)
  const context = await this.loadConversationContext(params);

  // 2. Build system prompt (industry-specific, with contact data)
  const systemPrompt = buildSystemPrompt(context.tenant, context.contact);

  // 3. Format message history for AI
  const messages = this.formatMessages(context.recentMessages, params.messageContent);

  // 4. Get available tools for this tenant's AI provider
  const tools = this.getAvailableTools(context.tenant);

  // 5. Call AI provider (Anthropic or OpenAI)
  const provider = getAIProvider(context.tenant.ai_provider || 'anthropic');
  const aiResponse = await provider.generateResponse(systemPrompt, messages, tools);

  // 6. Execute any tool calls returned by the AI
  if (aiResponse.toolCalls?.length) {
    await this.executeTools(aiResponse.toolCalls, context);

    // 7. If tools were called, make a FOLLOW-UP AI call with tool results
    const followUpResponse = await provider.generateResponse(
      systemPrompt,
      [...messages, { role: 'assistant', content: aiResponse.message, toolCalls: aiResponse.toolCalls }],
      tools
    );
    aiResponse.message = followUpResponse.message;
  }

  // 8. Save AI response as outbound message
  await this.saveMessage({
    conversation_id: params.conversationId,
    tenant_id: params.tenantId,
    direction: 'outbound',
    sender_type: 'ai',
    content: aiResponse.message,
    metadata: { confidence: aiResponse.confidence, intent: aiResponse.intent },
  });

  // 9. Send WhatsApp reply via Twilio
  await twilioService.sendWhatsAppMessage(params.tenantId, context.contact.whatsapp_number, aiResponse.message);

  // 10. Detect handoff need
  const handoff = this.detectHandoff(aiResponse, context.contact);
  if (handoff.needed) {
    await this.requestHumanHandoff(params.conversationId, handoff.reason, handoff.priority);
  }

  // 11. Update lead score, contact temperature, conversation insights
  await this.updateLeadScore(params.contactId, aiResponse.qualificationData);
  await this.updateContactTemperature(params.contactId, aiResponse.qualificationData);
  await this.updateConversationInsights(params.conversationId, aiResponse);
}
```

### executeTools() — Context Injection

```typescript
private async executeTools(toolCalls: ToolCall[], context: ConversationContext): Promise<void> {
  for (const toolCall of toolCalls) {
    try {
      console.log(`[AI Agent] Executing tool: ${toolCall.name}`);
      const parameters = {
        ...toolCall.parameters,
        tenantId: context.tenant.id,    // INJECTED
        contactId: context.contact.id,   // INJECTED
        conversationId: context.conversation.id, // INJECTED
      };
      const result = await executeTool(toolCall.name, parameters, context);
      toolCall.result = result;
      if (result.success) {
        console.log(`[AI Agent] Tool ${toolCall.name} executed successfully`);
      } else {
        console.error(`[AI Agent] Tool ${toolCall.name} failed:`, result.error);
      }
    } catch (error) {
      console.error(`[AI Agent] Error executing tool ${toolCall.name}:`, error);
      toolCall.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

**Critical:** `tenantId`, `contactId`, `conversationId` are always injected into tool parameters by the agent. Tools never receive these from the AI model directly.

### Handoff Detection Logic

```typescript
private detectHandoff(aiResponse: AIResponse, contact: any): HandoffDetection {
  if (aiResponse.confidence < 0.70)
    return { needed: true, reason: 'low_confidence', priority: 'medium' };
  if (contact.leadScore > 80 && contact.budget_range === 'high')
    return { needed: true, reason: 'high_value_lead', priority: 'high' };

  const handoffKeywords = ['human', 'agent', 'person', 'manager', 'complaint', 'sue', 'lawyer'];
  for (const keyword of handoffKeywords) {
    if (aiResponse.message.toLowerCase().includes(keyword))
      return { needed: true, reason: 'keyword_trigger', priority: 'high' };
  }

  if (aiResponse.sentiment === 'negative' && aiResponse.intent === 'complaint')
    return { needed: true, reason: 'escalation', priority: 'urgent' };
  if ((aiResponse.message.match(/\?/g) || []).length > 2)
    return { needed: true, reason: 'complex_query', priority: 'medium' };

  return { needed: false };
}
```

### requestHumanHandoff()

Updates conversation status to `handoff-requested` and queues a notification via `redisQueue`:

```typescript
private async requestHumanHandoff(conversationId, reason, priority): Promise<void> {
  await supabaseAdmin.from('conversations').update({
    status: 'handoff-requested', handoff_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);

  await redisQueue.queueMessage({
    type: 'ai_response',
    tenantId: '',
    payload: { conversationId, reason, priority, timestamp: new Date().toISOString(), handoffRequest: true },
    maxRetries: 3,
  });
}
```

## 2.3 AI Providers

### Provider Interface (`src/lib/ai/providers/index.ts`)

```typescript
export interface AIProvider {
  generateResponse(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    tools?: any[]
  ): Promise<AIResponse>;
}
```

Factory function selects provider based on tenant config:

```typescript
export function getAIProvider(provider: string): AIProvider {
  switch (provider) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    default: return new AnthropicProvider();
  }
}
```

### Anthropic Provider (`src/lib/ai/providers/anthropic.ts`)

- Calls `https://api.anthropic.com/v1/messages` via fetch
- Model: `claude-sonnet-4-20250514` (hardcoded)
- Max tokens: 1024
- Extracts tool calls from `tool_use` content blocks
- Parses qualification data, intent, sentiment from response text

### OpenAI Provider (`src/lib/ai/providers/openai.ts`)

- Calls `https://api.openai.com/v1/chat/completions` via fetch
- Model: `gpt-4o` (hardcoded)
- Max tokens: 1024
- Extracts tool calls from `response.choices[0].message.tool_calls`
- Same qualification/intent/sentiment extraction logic

## 2.4 System Prompts (`src/lib/ai/prompts.ts`)

The `buildSystemPrompt()` function dynamically constructs the system prompt using:

1. **CORE_RULES** — universal instructions (qualification, persona, formatting)
2. **INDUSTRY_CONTEXT** — per-industry context (real_estate, healthcare, automotive, etc.)
3. **Contact context** — name, temperature, budget, timeline, score, last offered slots
4. **Tenant context** — company name, industry, service types

The prompt instructs the AI to:
- Use `check_calendar` when user asks about availability
- Use `book_appointment` when user confirms a slot
- Use `update_lead` when user provides name, email, budget, timeline
- Use `send_email` for confirmations
- Use `cancel_appointment` when user wants to cancel
- Qualify leads by asking about budget, timeline, and needs
- Hand off to humans when unsure or when keywords are detected

### Lead Score Calculation (in prompts.ts)

```typescript
export function calculateLeadScore(industry: string, responses: Record<string, any>): { score: number } {
  // Industry-specific weights for budget, timeline, interest_level
  // Returns 0-100 score
}
```

## 2.5 Auto-Extract Safety Net (`src/lib/ai/auto-extract.ts`)

Runs on every inbound message BEFORE AI processing. Extracts via regex:

- **Email**: `/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi`
- **Phone**: `/(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g`
- **Name**: patterns like "I am [Name]", "My name is [Name]", "call me [Name]"
- **Budget hints**: AED/Dh patterns → categorized as `under-600k`, `600k-1m`, `1m-3m`, `3m-5m`, `5m+`
- **Timeline hints**: keyword matching → `urgent`, `this-month`, `1-3-months`, `3-6-months`, `exploring`

Only updates if existing contact data is missing (won't overwrite).

---

# 3. TOOL IMPLEMENTATIONS (FULL CODE)

## 3.1 Tool Registry & Execution (`src/lib/ai/tools/index.ts`)

### Tool Schemas (sent to AI provider)

| Tool | Required Params | Optional Params | Handler |
|------|----------------|-----------------|---------|
| `update_lead` | none | name, email, temperature, timeline, budget_range, service_interest, notes | `updateLead` |
| `check_calendar` | none | preferredDate, preferredTime | `checkCalendar` |
| `book_appointment` | slotTime | none | `bookAppointment` |
| `cancel_appointment` | none | appointmentId | `cancelAppointment` |
| `send_email` | to, template | data, language | `sendEmail` |

**Note:** `tenantId`, `contactId`, `conversationId` are NOT in schemas — they are injected by `agent.ts executeTools()`.

### executeTool() Dispatch

```typescript
export async function executeTool(toolName: string, parameters: any, context?: any): Promise<any> {
  const tool = AI_TOOLS[toolName as keyof typeof AI_TOOLS];
  if (!tool) {
    console.warn(`[AI Tool] Unknown tool: ${toolName}`);
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // Special handling: update_lead wraps flat params into { contactId, updates: {...} }
  let handlerParams = parameters;
  if (toolName === 'update_lead') {
    const { name, email, temperature, timeline, budget_range, service_interest, notes, ...rest } = parameters;
    handlerParams = {
      contactId: context?.contact?.id || parameters.contactId,
      updates: {
        ...(name && { name }),
        ...(email && { email }),
        ...(temperature && { temperature }),
        ...(timeline && { timeline }),
        ...(budget_range && { budget_range }),
        ...(service_interest && { service_interest }),
        ...(notes && { metadata: { ...(rest.metadata || {}), notes } }),
      },
    };
  }

  const handlers = await import('./index');
  const handler = handlers[tool.handler as keyof typeof handlers];
  if (typeof handler !== 'function') {
    return { success: false, error: `Tool handler not found: ${tool.handler}` };
  }

  try {
    const result = await handler(handlerParams, context);
    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### getAvailableTools() — Provider Format Adapter

```typescript
export function getAvailableTools(provider: string = 'anthropic'): any[] {
  if (provider === 'anthropic') {
    return Object.values(AI_TOOLS).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,       // Anthropic uses input_schema
    }));
  } else {
    return Object.values(AI_TOOLS).map(tool => ({
      type: 'function',
      function: {                           // OpenAI wraps in { type: 'function', function: {...} }
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
```

## 3.2 check_calendar (`src/lib/ai/tools/check-calendar.ts`)

Full implementation — 183 lines.

### Helper Functions

```typescript
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function extractDayName(input: string): string | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  return DAY_NAMES.find(day => lowered.includes(day)) || null;
}

function extractMonthDay(input: string): { monthIndex: number; day: number } | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  const monthKey = MONTH_KEYS.find(key => lowered.includes(key));
  const dayMatch = lowered.match(/\b([0-3]?\d)(st|nd|rd|th)?\b/);
  if (!monthKey || !dayMatch) return null;
  return { monthIndex: MONTH_KEYS.indexOf(monthKey), day: parseInt(dayMatch[1], 10) };
}

function extractTimeParts(input: string): { hours: number; minutes: number } | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  if (lowered.includes('noon')) return { hours: 12, minutes: 0 };
  if (lowered.includes('midnight')) return { hours: 0, minutes: 0 };
  const match = lowered.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  if (match[3] === 'pm' && hours < 12) hours += 12;
  if (match[3] === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
}

function timeMatches(slotTime: string, target: { hours: number; minutes: number }): boolean {
  const match = slotTime?.toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
  if (!match) return false;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (match[3] === 'pm' && hours < 12) hours += 12;
  if (match[3] === 'am' && hours === 12) hours = 0;
  return hours === target.hours && minutes === target.minutes;
}
```

### storeLastSlots() — Persists Offered Slots to Contact Metadata

```typescript
async function storeLastSlots(contactId: string | undefined, slots: any[], timezone: string): Promise<void> {
  if (!contactId) return;
  try {
    const { data: contact } = await supabaseAdmin
      .from('contacts').select('metadata').eq('id', contactId).single();

    const existingMetadata = contact?.metadata && typeof contact.metadata === 'object'
      && !Array.isArray(contact.metadata) ? contact.metadata : {};

    const slotPayload = (slots || []).slice(0, 20).map(slot => ({
      datetime: slot.datetime, formatted: slot.formatted,
      time: slot.time, dayName: slot.dayName, dateOnly: slot.dateOnly,
    }));

    await supabaseAdmin.from('contacts').update({
      metadata: {
        ...existingMetadata,
        calendar_last_slots: slotPayload,
        calendar_last_slots_at: new Date().toISOString(),
        calendar_last_timezone: timezone,
      },
    }).eq('id', contactId);
  } catch (error) {
    console.error('[Tool: checkCalendar] Failed to store last slots:', error);
  }
}
```

### Main checkCalendar() Function

```typescript
export async function checkCalendar({ tenantId, contactId, preferredDate, preferredTime }: CheckCalendarParams): Promise<{
  success: boolean; available_slots?: CalendarSlot[]; error?: string;
}> {
  try {
    const settings = await getAvailabilitySettings(tenantId);
    const timezone = settings?.timezone || 'Asia/Dubai';
    const parsedPreferred = preferredDate ? new Date(preferredDate) : null;
    const startDate = parsedPreferred && !Number.isNaN(parsedPreferred.getTime()) ? parsedPreferred : new Date();
    const searchDays = settings?.booking_window_days || 7;
    const slots = await getAvailableSlots(tenantId, startDate, searchDays);
    const preferredInput = [preferredDate, preferredTime].filter(Boolean).join(' ').toLowerCase();
    const preferredTimeInput = (preferredTime || '').toLowerCase();
    let filteredSlots = slots;

    // Filter by time (e.g. "3 pm", "noon")
    const timeParts = extractTimeParts(preferredTimeInput || preferredInput);
    if (timeParts) {
      filteredSlots = filteredSlots.filter(slot => timeMatches(slot.time || slot.formatted || '', timeParts));
    }

    // Filter by day name (e.g. "Monday", "Wednesday")
    const dayName = extractDayName(preferredInput);
    if (dayName) {
      filteredSlots = filteredSlots.filter(slot => slot.dayName.toLowerCase().startsWith(dayName));
    }

    // Filter by month/day (e.g. "Jan 15", "March 3rd")
    const monthDay = extractMonthDay(preferredInput);
    if (monthDay) {
      filteredSlots = filteredSlots.filter(slot => monthDayMatches(slot.dateOnly, monthDay));
    }

    // Filter by "today" / "tomorrow"
    if (preferredInput.includes('today') || preferredInput.includes('tomorrow')) {
      const baseInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
      if (preferredInput.includes('tomorrow')) baseInTz.setDate(baseInTz.getDate() + 1);
      const targetDateOnly = getDateOnlyInTimezone(baseInTz, timezone);
      filteredSlots = filteredSlots.filter(slot => slot.dateOnly === targetDateOnly);
    }

    // Fall back to ALL slots if filtering yields nothing
    const slotsToReturn = filteredSlots.length ? filteredSlots : slots;
    await storeLastSlots(contactId, slotsToReturn, timezone);

    return {
      success: true,
      available_slots: slotsToReturn.map(s => ({
        datetime: s.datetime, formatted: s.formatted, dayName: s.dayName, dateOnly: s.dateOnly,
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

**Design notes:**
- Filters are applied cumulatively (time AND day AND month)
- If all filters yield zero results, falls back to the full unfiltered slot list
- Always stores offered slots in `contacts.metadata.calendar_last_slots` for later resolution during booking

## 3.3 book_appointment (`src/lib/ai/tools/book-appointment.ts`)

Full implementation — 283 lines.

### resolveSlotTime() — Natural Language → ISO DateTime

This is the most critical function for booking accuracy. It resolves natural language like "3 pm tomorrow" or "Monday 10am" to an actual ISO datetime.

**Resolution priority:**
1. If input is already ISO format (`2024-01-15T10:00:00`), return as-is
2. Check `contacts.metadata.calendar_last_slots` (previously offered slots) for a match
3. Fall back to fetching all available slots from `getAvailableSlots(tenantId, new Date(), 14)`
4. Apply time, day name, month/day, and today/tomorrow filters
5. Return first match or null

```typescript
async function resolveSlotTime(
  rawSlotTime: string, tenantId: string, timezone?: string, contactId?: string
): Promise<string | null> {
  if (!rawSlotTime) return null;
  if (isIsoDateTime(rawSlotTime)) return rawSlotTime;

  const input = rawSlotTime.toLowerCase();
  const timeParts = extractTimeParts(input);
  if (!timeParts) return null;

  let candidates: any[] = [];

  // Priority 1: Check last offered slots from contact metadata
  if (contactId) {
    const { data: contact } = await supabaseAdmin
      .from('contacts').select('metadata').eq('id', contactId).single();
    const lastSlots = Array.isArray(contact?.metadata?.calendar_last_slots)
      ? contact.metadata.calendar_last_slots : [];
    if (lastSlots.length) {
      candidates = lastSlots.filter(slot => timeMatches(slot.time || slot.formatted || '', timeParts));
    }
  }

  // Priority 2: Fall back to global availability
  if (!candidates.length) {
    const slots = await getAvailableSlots(tenantId, new Date(), 14);
    if (!slots.length) return null;
    candidates = slots.filter(slot => timeMatches(slot.time, timeParts));
  }

  // Further filter by day name
  const dayName = extractDayName(input);
  if (dayName) {
    candidates = candidates.filter(slot => slot.dayName.toLowerCase().startsWith(dayName));
  }

  // Further filter by month/day
  const monthDay = extractMonthDay(input);
  if (monthDay) {
    candidates = candidates.filter(slot => monthDayMatches(slot.dateOnly, monthDay));
  }

  // Further filter by today/tomorrow
  if (input.includes('today') || input.includes('tomorrow')) {
    const tz = timezone || 'UTC';
    const baseInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    if (input.includes('tomorrow')) baseInTz.setDate(baseInTz.getDate() + 1);
    const targetDateOnly = getDateOnlyInTimezone(baseInTz, tz);
    candidates = candidates.filter(slot => slot.dateOnly === targetDateOnly);
  }

  if (!candidates.length) return null;
  return candidates[0].datetime;
}
```

### Main bookAppointment() Function

```typescript
export async function bookAppointment({ tenantId, contactId, conversationId, slotTime }: BookingParams): Promise<{
  success: boolean; meeting_link?: string; meeting_time?: string; error?: string;
}> {
  try {
    // 1. Fetch tenant config (company_name, timezone)
    const { data: tenant } = await supabaseAdmin
      .from('tenants').select('company_name, language, business_hours, timezone')
      .eq('id', tenantId).single();

    // 2. Fetch contact info (name, email, phone)
    const { data: contact } = await supabaseAdmin
      .from('contacts').select('name, email, whatsapp_number, language')
      .eq('id', contactId).single();

    // 3. Generate placeholder email if none exists
    const inviteeEmail = contact.email || `${contact.whatsapp_number.replace('+','')}@wa.placeholder`;

    // 4. Resolve slot time (natural language → ISO)
    const resolvedSlotTime = await resolveSlotTime(slotTime, tenantId, tenant.timezone, contactId);
    if (!resolvedSlotTime) {
      return { success: false, error: 'Selected time is not available. Please choose one of the offered slots.' };
    }

    // 5. Book via in-app calendar
    const bookingResult = await bookSlot({
      tenantId, scheduledAt: resolvedSlotTime, contactId, conversationId,
      customerName: contact.name || 'Customer',
      customerEmail: inviteeEmail,
      customerPhone: contact.whatsapp_number,
      duration: 30, appointmentType: 'consultation', bookedVia: 'whatsapp',
    });

    if (!bookingResult.success) {
      return { success: false, error: bookingResult.error || 'Failed to book appointment' };
    }

    // 6. Update contact temperature to 'booked'
    await updateLead({
      contactId,
      updates: {
        temperature: 'booked', qualification_status: 'contacted',
        metadata: { last_booking_at: new Date().toISOString(), appointment_id: bookingResult.appointment?.id },
      },
    });

    // 7. Send confirmation email (non-blocking, won't fail the booking)
    const formattedTime = formatDateTime(resolvedSlotTime, contact.language || 'en', tenant.timezone);
    if (contact.email && !contact.email.includes('@wa.placeholder')) {
      try {
        await sendEmail({
          to: contact.email, template: 'booking_confirmation',
          data: { company_name: tenant.company_name, meeting_time: formattedTime, customer_name: contact.name },
        });
      } catch (emailError) {
        console.error('[Tool: bookAppointment] Email sending failed:', emailError);
      }
    }

    return { success: true, meeting_time: formattedTime };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### formatDateTime() — Timezone-Aware Formatting

```typescript
function formatDateTime(datetime: string, language: string, timezone?: string): string {
  const date = new Date(datetime);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: timezone || 'UTC',
  };
  if (language === 'ar') return date.toLocaleDateString('ar-AE', options);
  return date.toLocaleDateString('en-US', options);
}
```

## 3.4 cancel_appointment (`src/lib/ai/tools/cancel-appointment.ts`)

```typescript
export async function cancelAppointment({ tenantId, contactId, appointmentId }: CancelAppointmentParams): Promise<{
  success: boolean; message?: string; error?: string;
}> {
  try {
    // If specific ID provided, cancel that one
    if (appointmentId) {
      const { error } = await supabaseAdmin.from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId).eq('tenant_id', tenantId).eq('contact_id', contactId);
      if (error) return { success: false, error: 'Failed to cancel appointment' };
      return { success: true, message: 'Appointment cancelled successfully' };
    }

    // Otherwise, cancel the most recent scheduled appointment
    const { data: appointment } = await supabaseAdmin.from('appointments')
      .select('id, scheduled_time')
      .eq('tenant_id', tenantId).eq('contact_id', contactId).eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true }).limit(1).single();

    if (!appointment) return { success: false, error: 'No scheduled appointment found to cancel' };

    await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id);
    return {
      success: true,
      message: `Appointment for ${new Date(appointment.scheduled_time).toLocaleString()} has been cancelled`
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

## 3.5 update_lead (`src/lib/ai/tools/update-lead.ts`)

```typescript
export async function updateLead({ contactId, updates }: UpdateLeadParams): Promise<{
  success: boolean; newScore?: number; error?: string; contact?: any;
}> {
  try {
    // 1. Validate contact exists
    const { data: existingContact, error: fetchError } = await supabaseAdmin
      .from('contacts').select('*').eq('id', contactId).single();
    if (fetchError || !existingContact) return { success: false, error: 'Contact not found' };

    // 2. Prepare update data with qualification_status mapping
    const updateData = { ...updates, updated_at: new Date().toISOString() };
    if (updates.temperature) {
      if (updates.temperature === 'booked') updateData.qualification_status = 'contacted';
      else if (updates.temperature === 'hot') updateData.qualification_status = 'qualified';
      else if (updates.temperature === 'cold') updateData.qualification_status = 'unqualified';
    }

    // 3. Update contact record
    const { data: updatedContact, error: updateError } = await supabaseAdmin
      .from('contacts').update(updateData).eq('id', contactId).select().single();
    if (updateError) return { success: false, error: 'Failed to update contact' };

    // 4. Recalculate lead score
    const newScore = await calculateLeadScore(updatedContact);
    await supabaseAdmin.from('contacts')
      .update({ lead_score: newScore, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    // 5. Handle follow-up scheduling based on temperature change
    if (updates.temperature) {
      if (updates.temperature === 'hot' || updates.temperature === 'booked') {
        await cancelFollowUps(contactId, updates.temperature === 'booked' ? 'converted' : 'hot_lead');
      } else if (updates.temperature === 'warm' || updates.temperature === 'cold') {
        const { data: conv } = await supabaseAdmin.from('conversations')
          .select('id').eq('contact_id', contactId)
          .order('created_at', { ascending: false }).limit(1).single();
        if (conv) {
          await scheduleFollowUps(existingContact.tenant_id, contactId, conv.id, updates.temperature);
        }
      }
    }

    return { success: true, newScore, contact: { ...updatedContact, lead_score: newScore } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

**Temperature → Follow-up mapping:**
- `hot` / `booked` → cancel all pending follow-ups
- `warm` → schedule warm follow-up sequence (day 3, 7, 21)
- `cold` → schedule cold follow-up sequence (day 3, 7, 21)

## 3.6 calculate_score (`src/lib/ai/tools/calculate-score.ts`)

```typescript
export async function calculateLeadScore(contact: any): Promise<number> {
  let score = 0;
  // +15 if email exists
  if (contact.email && !contact.email.includes('@wa.placeholder')) score += 15;
  // +10 if name exists
  if (contact.name && contact.name !== 'Unknown' && contact.name !== 'Customer') score += 10;
  // +20 if budget_range exists
  if (contact.budget_range) score += 20;
  // +15 if timeline exists
  if (contact.timeline) score += 15;
  // +10 if service_interest exists
  if (contact.service_interest) score += 10;
  // Temperature bonus: hot=+15, warm=+10, booked=+20
  if (contact.temperature === 'booked') score += 20;
  else if (contact.temperature === 'hot') score += 15;
  else if (contact.temperature === 'warm') score += 10;
  // Message count bonus (from DB)
  const msgCount = await getMessageCount(contact.id);
  if (msgCount > 10) score += 10;
  else if (msgCount > 5) score += 5;
  // Appointment bonus
  if (await hasAppointment(contact.id)) score += 10;
  return Math.min(score, 100);
}
```

## 3.7 send_email (`src/lib/ai/tools/send-email.ts`)

- Uses Resend API via direct `fetch('https://api.resend.com/emails', ...)`
- Templates: `booking_confirmation`, `lead_info`, `handoff_request`, `property_details`, `follow_up`
- Multi-language: English and Arabic (`en`, `ar`)
- Falls back gracefully if `RESEND_API_KEY` is not set
- Returns `{ success: true, messageId }` or `{ success: false, error }`

## 3.8 Follow-Up Scheduler (`src/lib/services/followup-scheduler.ts`)

```typescript
export async function scheduleFollowUps(tenantId, contactId, convId, temperature) {
  if (temperature === 'hot' || temperature === 'booked') return;
  const target = (temperature === 'warm') ? 'warm' : 'cold';

  // Fetch sequence template, contact data, tenant timezone
  const [seqRes, contactRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('follow_up_sequences').select('*')
      .eq('tenant_id', tenantId).eq('target_temperature', target).eq('is_active', true).limit(1),
    supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
    supabaseAdmin.from('tenants').select('timezone').eq('id', tenantId).single(),
  ]);

  const seq = seqRes.data?.[0];
  const tz = tenantRes.data?.timezone || 'UTC';
  if (!seq || !contactRes.data) return;

  // Cancel existing pending follow-ups
  await supabaseAdmin.from('scheduled_followups')
    .update({ status: 'cancelled', cancelled_reason: 'new_sequence' })
    .eq('contact_id', contactId).eq('status', 'pending');

  // Schedule day 3, 7, 21 follow-ups at 9:30 AM tenant time
  const followups = [
    { follow_up_type: 'day_3', scheduled_for: schedTime(3, tz), message_content: fill(seq.day_3_message, contactRes.data) },
    { follow_up_type: 'day_7', scheduled_for: schedTime(7, tz), message_content: fill(seq.day_7_message, contactRes.data) },
    { follow_up_type: 'day_21', scheduled_for: schedTime(21, tz), message_content: fill(seq.day_21_message, contactRes.data) },
  ];

  await supabaseAdmin.from('scheduled_followups').insert(
    followups.map(f => ({ tenant_id: tenantId, contact_id: contactId, conversation_id: convId, sequence_id: seq.id, ...f, status: 'pending' }))
  );
}

export async function cancelFollowUps(contactId: string, reason: string) {
  await supabaseAdmin.from('scheduled_followups')
    .update({ status: 'cancelled', cancelled_reason: reason })
    .eq('contact_id', contactId).eq('status', 'pending');
}
```

**Schedule timing:** `getNext930AM(tz)` computes the next 9:30 AM in the tenant's timezone, then adds (days - 1) to get the target date.

---

# 4. DATABASE LAYER

## 4.1 Supabase Client Architecture (`src/lib/db/client.ts`)

Two clients are exported as **lazy Proxy objects** so they initialize only on first use:

```typescript
// Service role client — bypasses RLS, used for all server-side operations
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) { return (getSupabaseAdmin() as any)[prop]; }
});

// Anon client — respects RLS, used for client-side operations
export const supabaseClient = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) { return (getSupabaseClient() as any)[prop]; }
});
```

**Critical:** All AI tools and webhook handlers use `supabaseAdmin` (service role key), which **bypasses RLS**. RLS policies only apply to dashboard API routes using `supabaseClient` or direct Supabase calls from the frontend.

A `createTenantClient(tenantId)` helper exists that sets `x-tenant-id` header, but is not widely used in the codebase.

## 4.2 Core Schema (`src/lib/db/schema.sql`)

### Table Overview

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Multi-tenant orgs | `company_name`, `subscription_tier`, `ai_provider`, `twilio_whatsapp_number`, `industry`, `timezone` |
| `users` | Dashboard users | `tenant_id`, `email`, `password_hash`, `role` (owner/admin/agent/viewer) |
| `contacts` | Leads/customers | `tenant_id`, `whatsapp_number`, `temperature`, `lead_score`, `metadata` (JSONB) |
| `conversations` | Chat sessions | `tenant_id`, `contact_id`, `status`, `is_active`, `message_count` |
| `messages` | Individual messages | `conversation_id`, `direction`, `sender_type`, `content`, `ai_confidence` |
| `appointments` | Booked meetings | `tenant_id`, `contact_id`, `scheduled_time`, `status`, `duration_minutes` |
| `ai_prompts` | Customizable prompts | `tenant_id` (NULL = default), `prompt_type`, `content`, `industry` |
| `webhook_events` | Idempotent webhook log | `source`, `payload`, `processed`, `retry_count` |
| `conversation_usage` | Billing tracking | `tenant_id`, `billing_month`, `conversation_count`, `overage_count` |
| `rate_limits` | WhatsApp rate limiting | `tenant_id`, `whatsapp_number`, `window_start`, `message_count` |
| `audit_logs` | Change tracking | `action`, `table_name`, `old_values`, `new_values` |

### Additional Tables (from migrations)

| Table | Purpose | Schema File |
|-------|---------|-------------|
| `availability_settings` | Per-tenant calendar config | Created via API/migration |
| `blocked_slots` | Blocked time ranges | `handoff-schema.sql` area |
| `handoff_logs` | Handoff trigger records | `handoff-schema.sql` |
| `notifications` | User notifications | `handoff-schema.sql` |
| `notification_logs` | Notification audit | `handoff-schema.sql` |
| `follow_up_sequences` | Follow-up templates | Created via migration |
| `scheduled_followups` | Pending follow-ups | Created via migration |
| `ai_processing_logs` | AI error/debug logs | `ai-processing-logs.sql` |
| `hourly_stats` | Conversation volume | `dashboard-kpis.sql` |

## 4.3 Key Table Schemas (Full DDL)

### tenants

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    subscription_tier TEXT NOT NULL CHECK (subscription_tier IN ('free', 'starter', 'growth', 'scale', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'past_due')),
    stripe_customer_id TEXT,
    twilio_account_sid TEXT,
    twilio_auth_token TEXT,
    twilio_whatsapp_number TEXT,
    calendly_api_key TEXT,
    calendly_event_url TEXT,
    industry TEXT CHECK (industry IN ('real-estate', 'automotive', 'home-services', 'medical', 'other')),
    language TEXT[] DEFAULT ARRAY['en', 'ar'],
    business_hours JSONB DEFAULT '{}',
    services JSONB DEFAULT '[]',
    faqs JSONB DEFAULT '[]',
    ai_provider TEXT DEFAULT 'anthropic' CHECK (ai_provider IN ('anthropic', 'openai')),
    ai_model TEXT DEFAULT 'claude-3-sonnet-20240229',
    monthly_conversation_limit INTEGER NOT NULL DEFAULT 500,
    setup_completed BOOLEAN DEFAULT false,
    ai_assistant_name TEXT DEFAULT 'Sarah',
    agent_display_name TEXT,
    trial_start_date TIMESTAMPTZ,
    trial_end_date TIMESTAMPTZ,
    trial_conversation_limit INTEGER DEFAULT 25,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### contacts

```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL,
    name TEXT,
    email TEXT,
    language TEXT DEFAULT 'en',
    temperature TEXT DEFAULT 'new' CHECK (temperature IN ('new', 'warm', 'hot', 'cold', 'booked', 'lost')),
    lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
    qualification_status TEXT DEFAULT 'unqualified' CHECK (qualification_status IN ('unqualified', 'qualified', 'contacted', 'converted')),
    timeline TEXT CHECK (timeline IN ('urgent', 'this-week', 'this-month', 'exploring', 'not-specified')),
    budget_range TEXT,
    service_interest TEXT,
    notes TEXT,
    source TEXT DEFAULT 'organic',
    assigned_to UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, whatsapp_number)
);
```

**`metadata` JSONB field** stores dynamic data including:
- `calendar_last_slots` — array of last offered calendar slots
- `calendar_last_slots_at` — timestamp of when slots were offered
- `calendar_last_timezone` — timezone used for slot formatting
- `firstMessageTo` — the WhatsApp number the contact first messaged
- `notes` — free-form notes from AI
- `last_booking_at` — timestamp of last booking
- `appointment_id` — ID of last booked appointment

### appointments

```sql
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    calendly_event_id TEXT UNIQUE,
    scheduled_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    meeting_link TEXT,
    meeting_type TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')),
    reminder_sent BOOLEAN DEFAULT false,
    reminder_count INTEGER DEFAULT 0,
    notes TEXT,
    calendar_synced BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Appointment statuses:** `scheduled` → `confirmed` → `completed` | `cancelled` | `no-show`

### conversations

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conversation_window_end TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'handoff-requested', 'human-handling', 'closed')),
    handoff_reason TEXT,
    handled_by UUID REFERENCES users(id),
    ai_confidence_avg DECIMAL(3,2),
    summary TEXT,
    key_insights JSONB DEFAULT '[]',
    -- Handoff extension fields (from handoff-schema.sql):
    handoff_requested_at TIMESTAMPTZ,
    handoff_claimed_at TIMESTAMPTZ,
    handoff_claimed_by UUID REFERENCES users(id),
    handoff_resolved_at TIMESTAMPTZ,
    handoff_resolution TEXT,
    handoff_notes TEXT,
    handoff_triggers TEXT[],
    handoff_escalated BOOLEAN DEFAULT FALSE,
    assigned_agent_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### messages

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'ai', 'human')),
    sender_id UUID,
    content TEXT NOT NULL,
    language TEXT,
    twilio_message_sid TEXT UNIQUE,
    ai_confidence DECIMAL(3,2),
    ai_intent TEXT,
    ai_sentiment TEXT,
    requires_handoff BOOLEAN DEFAULT false,
    handoff_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4.4 Row Level Security (RLS)

All tables have RLS enabled. The standard pattern is:

```sql
CREATE POLICY "Table tenant access" ON table_name
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );
```

**Important:** `supabaseAdmin` (service role key) **bypasses all RLS**. Only direct client calls use RLS.

Special cases:
- `ai_prompts`: allows access to rows where `tenant_id IS NULL` (default prompts)
- `webhook_events`: allows access to rows where `tenant_id IS NULL`

## 4.5 Triggers and Functions

### Auto-updated `updated_at`

Applied to: `tenants`, `users`, `contacts`, `conversations`, `appointments`, `ai_prompts`, `conversation_usage`

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql';
```

### Message Count Increment

On every message insert, increments `conversations.message_count` and updates `contacts.last_message_at`:

```sql
CREATE TRIGGER increment_message_count AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION increment_conversation_count();
```

### Conversation Usage Tracking

On every new conversation, inserts/updates `conversation_usage` for the billing month:

```sql
CREATE TRIGGER track_conversation_usage_trigger AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION track_conversation_usage();
```

### Audit Logging

Applied to `tenants`, `users`, `contacts` — logs INSERT/UPDATE/DELETE with old and new values:

```sql
CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

### 24-Hour Conversation Window Closure

```sql
CREATE OR REPLACE FUNCTION close_conversation_windows()
RETURNS void AS $$
BEGIN
    UPDATE conversations SET conversation_window_end = NOW(), is_active = false, status = 'closed'
    WHERE is_active = true AND conversation_window_start < NOW() - INTERVAL '24 hours';
END; $$ LANGUAGE plpgsql;
```

**Note:** This function must be called by an external cron job — it is not auto-triggered.

## 4.6 Handoff Schema (`src/lib/db/handoff-schema.sql`)

### handoff_logs

```sql
CREATE TABLE handoff_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    message TEXT NOT NULL,
    ai_confidence DECIMAL(3,2),
    ai_sentiment TEXT,
    agent_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### notifications

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);
```

### Handoff Dashboard View

```sql
CREATE OR REPLACE VIEW handoff_dashboard AS
SELECT c.id, c.status, c.handoff_reason, c.handoff_requested_at, c.handoff_claimed_at,
  c.handoff_claimed_by, c.handoff_resolved_at, c.handoff_resolution, c.handoff_notes,
  c.handoff_triggers, c.handoff_escalated, c.tenant_id,
  ct.name as contact_name, ct.whatsapp_number as contact_phone, ct.email as contact_email,
  u.full_name as agent_name,
  CASE WHEN c.handoff_claimed_at IS NOT NULL AND c.handoff_requested_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (c.handoff_claimed_at - c.handoff_requested_at)) / 60
    ELSE NULL END as response_time_minutes,
  CASE
    WHEN c.handoff_escalated = TRUE THEN 'high'
    WHEN EXISTS (SELECT 1 FROM unnest(c.handoff_triggers) as t
      WHERE t IN ('high_value_lead','keyword_match','negative_sentiment','urgent_timeline')) THEN 'high'
    WHEN array_length(c.handoff_triggers, 1) > 1 THEN 'medium'
    ELSE 'low' END as severity
FROM conversations c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN users u ON c.handoff_claimed_by = u.id
WHERE c.status IN ('handoff-requested', 'human-handled', 'resolved')
ORDER BY c.handoff_requested_at DESC;
```

### Handoff Statistics Function

```sql
CREATE OR REPLACE FUNCTION get_handoff_statistics(tenant_uuid UUID, days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'handoff-requested'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'human-handled'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'escalated', COUNT(*) FILTER (WHERE handoff_escalated = TRUE),
    'avg_response_time', ROUND(AVG(
      EXTRACT(EPOCH FROM (handoff_claimed_at - handoff_requested_at)) / 60
    ))::INTEGER
  ) FROM conversations
  WHERE tenant_id = tenant_uuid
  AND status IN ('handoff-requested', 'human-handled', 'resolved')
  AND created_at >= CURRENT_DATE - INTERVAL '1 day' * days;
$$ LANGUAGE plpgsql;
```

## 4.7 Views

| View | Purpose |
|------|---------|
| `conversation_summary` | Joins conversations + contacts + latest message time |
| `tenant_usage_stats` | Joins tenants + current month usage + overage calculation |
| `handoff_dashboard` | Joins conversations + contacts + agents for handoff queue |
| `dashboard_kpis` | Aggregates tenant metrics (total convos, active leads, appointments) |

## 4.8 Authentication (`src/lib/auth.ts`)

NextAuth v4 with JWT strategy and CredentialsProvider:

```typescript
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // 1. Look up user by email in Supabase (joins tenants table)
        // 2. Compare password_hash via bcrypt
        // 3. Verify tenant subscription is not 'cancelled'
        // 4. Return { id, email, name, tenantId, role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.tenantId = user.tenantId; token.role = user.role; }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role;
      return session;
    },
  },
  pages: { signIn: '/auth/login', error: '/auth/error' },
  secret: env.NEXTAUTH_SECRET,
};
```

**Key:** `session.user.tenantId` is how all dashboard API routes determine the current tenant.

---

# 5. DASHBOARD CALENDAR LOGIC

## 5.1 Calendar Page (`src/app/dashboard/calendar/page.tsx`)

A client-side React component (`'use client'`) that renders a monthly calendar grid with appointment and block overlays.

### State Management

```typescript
const [appointments, setAppointments] = useState<Appointment[]>([]);
const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
const [loading, setLoading] = useState(true);
const [currentDate, setCurrentDate] = useState(new Date());     // controls which month is displayed
const [selectedDate, setSelectedDate] = useState(new Date());   // which day is selected in the sidebar
const [showBlockModal, setShowBlockModal] = useState(false);
```

### Data Fetching

On mount and whenever `currentDate` changes, fetches both appointments and blocked slots for the displayed month:

```typescript
const fetchCalendarData = async () => {
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
  const [appointmentsRes, blocksRes] = await Promise.all([
    fetch(`/api/calendar/appointments?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`),
    fetch(`/api/calendar/blocks?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`),
  ]);
  // Parse and set state...
};
```

### Calendar Grid Construction

Uses `useMemo` to generate a 42-cell (6-week) grid starting from the Sunday before the first of the month:

```typescript
const calendarDays = useMemo(() => {
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const start = new Date(startOfMonth);
  start.setDate(startOfMonth.getDate() - startOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}, [currentDate]);
```

### Date Grouping

Appointments and blocks are grouped by date key (`en-CA` locale = `YYYY-MM-DD`):

```typescript
const toDateKey = (value: Date | string) => new Date(value).toLocaleDateString('en-CA');

const appointmentsByDate = useMemo(() => {
  return appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const key = toDateKey(apt.scheduled_time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(apt);
    return acc;
  }, {});
}, [appointments]);
```

### Day Cell Rendering

Each calendar cell shows:
- Day number (highlighted blue if today)
- Count of upcoming/completed/cancelled/no-show appointments
- Ban icon if blocked slots exist
- Blue ring if selected

### Selected Day Sidebar

Right panel shows:
- All appointments for the selected date, sorted by time
- Status badges: `scheduled` (blue), `confirmed` (blue), `completed` (green), `cancelled` (red), `no-show` (yellow)
- Contact name resolved from `apt.contacts?.name || apt.customer_name || apt.customer_phone`
- Meeting link with "Join" button if present
- Blocked time ranges with delete button

### Block Time Modal

Modal form with date, start time, end time, and optional reason. On save:

```typescript
const handleSaveBlock = async () => {
  const start = new Date(`${blockForm.date}T${blockForm.start}:00`);
  const end = new Date(`${blockForm.date}T${blockForm.end}:00`);
  // Validation: non-NaN, end > start
  const res = await fetch('/api/calendar/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      reason: blockForm.reason?.trim() || null,
    }),
  });
  // On success: close modal, refetch calendar data
};
```

**Important timezone note:** The block modal constructs dates using `new Date('YYYY-MM-DDThh:mm:00')` which parses in the **browser's local timezone**, not the tenant's configured timezone. This means blocks are stored in UTC based on the user's browser timezone, which may differ from `Asia/Dubai`.

## 5.2 Availability Settings Page (`src/app/dashboard/calendar/availability/page.tsx`)

Manages per-tenant weekly schedule and appointment configuration.

### Configurable Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `{day}_enabled` | boolean | Mon-Fri: true, Sat-Sun: false | Whether that day accepts bookings |
| `{day}_start` | string (HH:MM) | `09:00` | Start of business hours |
| `{day}_end` | string (HH:MM) | `17:00` (Sat/Sun: `13:00`) | End of business hours |
| `slot_duration` | number | 30 | Minutes per appointment slot |
| `buffer_time` | number | 0 | Minutes between appointments |
| `max_per_day` | number | 20 | Maximum appointments per day |
| `booking_window_days` | number | 30 | How far ahead bookings are allowed |
| `min_notice_hours` | number | 2 | Minimum hours before a slot can be booked |
| `timezone` | string | `Asia/Dubai` | IANA timezone identifier |

### Available Timezones (hardcoded in UI)

```typescript
const TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain',
  'Africa/Cairo', 'Europe/London', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Singapore',
];
```

### Save Flow

POST to `/api/calendar/availability` with flattened payload:

```typescript
const payload: Record<string, any> = { ...settings };
DAYS.forEach(({ key }) => {
  payload[`${key}_enabled`] = days[key].enabled;
  payload[`${key}_start`] = days[key].start;
  payload[`${key}_end`] = days[key].end;
});
```

The API route performs an upsert: checks if `availability_settings` row exists for the tenant, then updates or inserts accordingly.

## 5.3 Calendar API Routes

### `GET /api/calendar/appointments`

**File:** `src/app/api/calendar/appointments/route.ts`

- Requires authenticated session with `tenantId`
- Accepts `start` and `end` query params (ISO strings)
- **Expands range by ±1 day** to avoid timezone edge misses
- Joins `contacts(name, whatsapp_number, email)` via foreign key
- Returns `{ appointments: [...] }` ordered by `scheduled_time ASC`

```typescript
const rangeStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
const rangeEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
```

### `GET /api/calendar/blocks`

**File:** `src/app/api/calendar/blocks/route.ts`

- Fetches `blocked_slots` where `start_time <= end` AND `end_time >= start`
- Returns `{ blocks: [...] }` ordered by `start_time ASC`

### `POST /api/calendar/blocks`

- Validates `start_time`, `end_time` (both required, valid dates, end > start)
- Inserts into `blocked_slots` with `tenant_id`
- Returns the created block

### `DELETE /api/calendar/blocks?id=uuid`

- Deletes by `id` AND `tenant_id` (prevents cross-tenant deletion)
- Returns `{ success: true }`

### `GET /api/calendar/availability`

**File:** `src/app/api/calendar/availability/route.ts`

- Returns `availability_settings` for tenant, or hardcoded defaults if none exist

### `POST /api/calendar/availability`

- Upserts `availability_settings` — checks for existing row, then UPDATE or INSERT
- Accepts all day-level settings + global settings in one payload

---

# 6. TIMEZONE CONFIGURATION

## 6.1 Timezone Sources

The system has **multiple timezone touchpoints**, which is a source of potential inconsistency:

| Component | Timezone Source | Default |
|-----------|----------------|---------|
| `availability_settings.timezone` | Per-tenant DB field | `Asia/Dubai` |
| `getDefaultSettings()` in `inapp.ts` | Hardcoded fallback | `Asia/Dubai` |
| `getAvailableSlots()` | Reads from `settings.timezone` | `Asia/Dubai` |
| `check-calendar.ts` slot formatting | Uses tenant timezone from availability | `Asia/Dubai` |
| `book-appointment.ts` `resolveSlotTime()` | Server-local `new Date()` construction | Server TZ |
| `followup-scheduler.ts` | Reads `tenants.business_hours.timezone` OR fallback | `Asia/Dubai` |
| Dashboard calendar page | **Browser local timezone** via `new Date()` | Varies |
| Dashboard availability page | Configurable dropdown (13 options) | `Asia/Dubai` |
| Appointments API range expansion | ±1 day buffer on queries | N/A |

## 6.2 Slot Generation Timezone Handling (`inapp.ts`)

When generating available slots, the service:

1. Reads `settings.timezone` (default `Asia/Dubai`)
2. Constructs slot `Date` objects using **server-local** `new Date()` and `setHours()`
3. Formats display strings using `toLocaleString('en-US', { timeZone: timezone })`

```typescript
const timezone = settings.timezone || 'Asia/Dubai';
// ...
slots.push({
  datetime: slotDate.toISOString(),                    // UTC ISO string
  formatted: slotDate.toLocaleString('en-US', {        // Formatted in tenant TZ
    weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: timezone,
  }),
  // ...
});
```

**Critical issue:** `slotDate` is constructed using `new Date(date).setHours(h, m, 0, 0)` which operates in the **server's local timezone**, not the tenant's timezone. The `formatted` string is correctly rendered in the tenant's timezone, but the underlying `datetime` ISO string may represent a different wall-clock time if the server is not in the same timezone as the tenant.

**Example:** If the server runs in UTC and the tenant is in `Asia/Dubai` (UTC+4):
- `setHours(9, 0)` creates 09:00 UTC (which is 13:00 Dubai time)
- The `formatted` field shows "1:00 PM" (Dubai time) — correct for the ISO value
- But the intended slot was 9:00 AM Dubai time (05:00 UTC) — **mismatch**

This is partially mitigated by the fact that most deployments run on servers with timezone set to match the primary tenant region, or the ±1 day buffer on queries catches edge cases.

## 6.3 Follow-up Scheduler Timezone

```typescript
function getNext930AM(timezone: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: 'numeric', hour12: false,
  });
  const currentHour = parseInt(formatter.format(now));
  const target = new Date(now);
  if (currentHour >= 10) target.setDate(target.getDate() + 1);
  target.setHours(9, 30, 0, 0);  // Server-local 9:30, not tenant-local
  return target;
}
```

**Same server-timezone issue:** `setHours(9, 30)` sets 9:30 in the server's local timezone, not the tenant's timezone. The `Intl.DateTimeFormat` check for `currentHour` correctly reads the tenant's timezone, but the resulting `Date` object is offset.

## 6.4 Dashboard Timezone Behavior

- **Calendar page:** `toDateKey()` uses `new Date(value).toLocaleDateString('en-CA')` which converts to the **browser's** local timezone for date grouping.
- **Block time modal:** Constructs dates using `new Date('YYYY-MM-DDThh:mm:00')` — parsed in browser's local timezone.
- **Appointments API:** Expands query range by ±1 day to compensate for timezone differences between browser and server.

## 6.5 Timezone Recommendations for Debuggers

1. Check server's `TZ` environment variable — many issues are masked when server TZ matches tenant TZ
2. The `formatted` fields on slots are correctly localized; the `datetime` ISO strings may not represent the intended wall-clock time
3. Dashboard users in different timezones than the tenant may see appointments grouped on wrong dates
4. Follow-up scheduling times may be off by the difference between server TZ and tenant TZ

---

# 7. FULL BOOKING FLOW TRACE

## 7.1 End-to-End Flow: Customer WhatsApp Message → Booked Appointment

### Step 1: Twilio Delivers Webhook

```
POST /api/webhook/twilio
Content-Type: application/x-www-form-urlencoded
x-twilio-signature: <signature>

MessageSid=SM...&From=whatsapp:+971501234567&To=whatsapp:+14099083940&Body=I'd like to book an appointment
```

### Step 2: Webhook Handler (`src/app/api/webhook/twilio/route.ts`)

1. **Parse body** — extract `MessageSid`, `From`, `To`, `Body`
2. **Verify Twilio signature** — using `twilioService.verifyWebhookSignature()`
3. **Find tenant** — `twilioService.getTenantByWhatsAppNumber(toNumber)` looks up `tenants.twilio_whatsapp_number`
4. **Trial/limit check** — `checkTenantLimits()` verifies subscription status and monthly conversation count
5. **Idempotency check** — query `webhook_events` by `messageSid` to skip duplicates
6. **Store webhook event** — insert into `webhook_events` with `processed: false`
7. **Get/create contact** — lookup by `(tenant_id, whatsapp_number)` or insert new with `temperature: 'new'`
8. **Get/create conversation** — find most recent non-closed conversation, or close old ones and create new
9. **Save inbound message** — insert into `messages` with `direction: 'inbound'`, `sender_type: 'contact'`
10. **Auto-extract** — run `autoExtractAndSave()` for name, email, budget, timeline extraction from message text
11. **AI processing** — if conversation is not in `human-handling`, call `aiAgent.processInboundMessage()`

### Step 3: AI Agent Processing (`src/lib/ai/agent.ts`)

`processInboundMessage()` flow:

1. **Load tenant config** — fetch tenant row for AI provider/model, company name, services
2. **Load conversation history** — fetch last 20 messages for context
3. **Build system prompt** — fetch `ai_prompts` for tenant, inject variables (`{{company_name}}`, `{{services}}`, etc.)
4. **Call AI provider** — send to Anthropic Claude or OpenAI GPT with tool definitions
5. **Parse response** — extract text response and any tool calls
6. **Execute tool calls** — if AI requests `check_calendar`, `book_appointment`, etc.
7. **Handoff detection** — check if AI flagged handoff or if keywords/sentiment trigger handoff
8. **Send response** — send AI's text response back via Twilio WhatsApp
9. **Save outbound message** — insert into `messages` with `direction: 'outbound'`, `sender_type: 'ai'`
10. **Log AI processing** — insert into `ai_processing_logs`

### Step 4: AI Calls `check_calendar` Tool

When the customer asks about availability, the AI calls `check_calendar`:

```json
{
  "name": "check_calendar",
  "parameters": {
    "preferred_date": "tomorrow",
    "preferred_time": "morning"
  }
}
```

Execution in `check-calendar.ts`:

1. **Get available slots** — `getAvailableSlots(tenantId)` from `inapp.ts`
2. **Filter by preference** — parse natural language date/time, filter slots
3. **Store last slots** — save offered slots to `contacts.metadata.calendar_last_slots`
4. **Return formatted list** — AI receives slot list to present to customer

### Step 5: Customer Picks a Slot

Customer replies: "The 10am one on Tuesday please"

AI processes this and calls `book_appointment`:

```json
{
  "name": "book_appointment",
  "parameters": {
    "datetime": "Tuesday 10am",
    "customer_name": "Ahmed",
    "customer_email": "ahmed@example.com"
  }
}
```

### Step 6: `book_appointment` Execution (`src/lib/ai/tools/book-appointment.ts`)

1. **Resolve slot time** — `resolveSlotTime()`:
   - First checks `contacts.metadata.calendar_last_slots` for a match
   - Parses natural language input ("Tuesday 10am")
   - Tries to match against previously offered slots
   - Falls back to global availability search
2. **Verify availability** — `isSlotAvailable(tenantId, resolvedTime)`
3. **Book slot** — `bookSlot()` in `inapp.ts`:
   - Double-checks availability (race condition guard)
   - Inserts into `appointments` table
   - Falls back to legacy insert if extended columns fail
4. **Update contact** — set `temperature: 'booked'`, update `metadata` with `appointment_id`
5. **Send confirmation email** — via `sendEmail` tool if email is available
6. **Return result** — AI receives booking confirmation to relay to customer

### Step 7: Response Sent to Customer

AI composes confirmation message, sent via `twilioService.sendWhatsAppMessage()`:

```
Great news, Ahmed! Your appointment is confirmed for Tuesday, Jan 14 at 10:00 AM.
We look forward to seeing you!
```

### Step 8: Webhook Marked Processed

```typescript
await supabaseAdmin.from('webhook_events')
  .update({ processed: true, processed_at: new Date().toISOString() })
  .eq('tenant_id', tenantId)
  .eq('event_type', 'inbound_message')
  .ilike('payload->>messageSid', messageSid);
```

## 7.2 Cancellation Flow

1. Customer sends: "I need to cancel my appointment"
2. AI calls `cancel_appointment` tool
3. Tool finds most recent `scheduled` appointment for the contact
4. Updates `appointments.status` to `cancelled`
5. AI confirms cancellation to customer

## 7.3 Handoff Flow

1. AI detects handoff trigger (keywords, low confidence, explicit request)
2. Updates `conversations.status` to `handoff-requested`
3. Inserts into `handoff_logs`
4. Creates `notifications` for assigned agents
5. Subsequent messages are saved but **AI is skipped** (Step 9 in webhook)
6. Human agent responds via dashboard, setting status to `human-handling`

---

# 8. ERROR HANDLING

## 8.1 Webhook Layer Error Strategy

The Twilio webhook handler (`src/app/api/webhook/twilio/route.ts`) follows a **"never return 4xx/5xx to Twilio"** pattern to prevent Twilio from retrying and creating duplicate processing:

```typescript
// Top-level catch returns 200 with error info
catch (error) {
  logErr('Unhandled error', error);
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : 'Unknown error', logs },
    { status: 200 }
  );
}
```

**Only exception:** Invalid Twilio signature returns `403` to reject unauthenticated requests.

### Structured Logging

Every webhook invocation maintains an in-memory `logs[]` array:

```typescript
const logs: string[] = [];
const log = (msg: string) => { console.log(`[Twilio WH] ${msg}`); logs.push(msg); };
const logErr = (msg: string, err?: any) => { console.error(`[Twilio WH] ${msg}`, err || ''); logs.push(`ERROR: ${msg}`); };
```

Logs are included in error responses for debugging but **not persisted to database** unless the AI processing log captures them.

### Idempotency Guard

```typescript
const { data: existing } = await supabaseAdmin
  .from('webhook_events')
  .select('id, processed')
  .eq('event_type', 'inbound_message')
  .ilike('payload->>messageSid', messageSid)
  .maybeSingle();

if (existing?.processed) {
  log(`Already processed: ${messageSid}`);
  return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
}
```

**Note:** Uses `ilike` (case-insensitive) for `messageSid` matching on JSONB payload field.

## 8.2 AI Processing Error Handling

### AI Agent Level (`src/lib/ai/agent.ts`)

The AI agent wraps all processing in try/catch and logs errors to `ai_processing_logs`:

```typescript
try {
  await aiAgent.processInboundMessage({ tenantId, contactId, conversationId, messageContent, language });
  log('AI response sent successfully');
} catch (aiErr) {
  logErr('AI processing failed', aiErr);
  // Fallback message
  await twilioService.sendWhatsAppMessage(
    tenantId, contact.whatsapp_number,
    "Thanks for your message! Our team will get back to you shortly.",
    { bypassRateLimit: true }
  );
}
```

**Key behaviors:**
- If AI processing fails, a **hardcoded fallback message** is sent so the customer isn't left without a response
- If the fallback message also fails, the error is logged but the webhook still returns 200
- The `bypassRateLimit: true` flag ensures the fallback isn't blocked by rate limiting

### Tool Execution Error Handling

Each tool call is wrapped individually:

```typescript
private async executeTools(toolCalls: ToolCall[], context: ConversationContext): Promise<void> {
  for (const toolCall of toolCalls) {
    try {
      const result = await executeTool(toolCall.name, parameters, context);
      toolCall.result = result;
    } catch (error) {
      toolCall.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

**Behavior:** A failed tool does **not** abort the entire AI response. The AI receives the error in the tool result and can craft an appropriate message to the customer (e.g., "I'm having trouble checking the calendar right now, let me connect you with a team member").

### AI Processing Log Table

```sql
CREATE TABLE ai_processing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    conversation_id UUID REFERENCES conversations(id),
    contact_id UUID REFERENCES contacts(id),
    message_content TEXT,
    ai_provider TEXT,
    ai_model TEXT,
    tool_calls JSONB,
    ai_response TEXT,
    processing_time_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This table captures every AI invocation including:
- Which provider/model was used
- What tools were called and their results
- The full AI response text
- Processing time in milliseconds
- Any error messages

## 8.3 Database Error Handling

### Supabase Client Errors

All database operations follow the pattern:

```typescript
const { data, error } = await supabaseAdmin.from('table').select('*')...;
if (error) {
  console.error('[Context] Error:', error);
  // Handle gracefully — usually return error response or throw
}
```

### Booking Race Condition

The `bookSlot()` function in `inapp.ts` performs a **double-check** pattern:

```typescript
// 1. isSlotAvailable() — first check
const available = await isSlotAvailable(params.tenantId, params.scheduledAt, duration);
if (!available) return { success: false, error: 'Slot is no longer available' };

// 2. Insert — if a concurrent booking happened between check and insert,
//    the Supabase insert may succeed (no unique constraint on scheduled_time)
```

**Limitation:** There is no database-level unique constraint on `(tenant_id, scheduled_time)` for the `appointments` table, so concurrent bookings for the same slot are theoretically possible. The `isSlotAvailable()` check provides application-level protection but is not atomic.

### Legacy Insert Fallback

If the primary appointment insert fails (e.g., due to missing columns in an older schema), a fallback insert with minimal columns is attempted:

```typescript
if (error) {
  console.error('[InApp Calendar] Book error:', error);
  const { data: legacyAppointment, error: legacyError } = await supabaseAdmin
    .from('appointments')
    .insert({
      tenant_id: params.tenantId,
      contact_id: params.contactId || null,
      conversation_id: params.conversationId || null,
      scheduled_time: params.scheduledAt,
      duration_minutes: duration,
      status: 'scheduled',
    })
    .select().single();
}
```

## 8.4 Rate Limiting

### WhatsApp Message Rate Limiting

`DatabaseService.checkRateLimit()` enforces 1 message per second per WhatsApp number:

```typescript
const maxMessagesPerSecond = 1;
const windowStart = new Date();
windowStart.setSeconds(windowStart.getSeconds() - 1);

const { data: rateLimit } = await supabaseAdmin
  .from('rate_limits')
  .select('message_count')
  .eq('tenant_id', tenantId)
  .eq('whatsapp_number', whatsappNumber)
  .gte('window_start', windowStart.toISOString())
  .single();
```

### Tenant Conversation Limits

`checkTenantLimits()` in the webhook handler:

| Tier | Monthly Limit |
|------|--------------|
| `free` / `trial` | 25 |
| `starter` | 200 |
| `growth` | 800 |
| `scale` | 2500 |
| `enterprise` | Unlimited (from DB) |

When limits are exceeded, a polite message is sent and the webhook returns early without AI processing.

## 8.5 Auto-Extraction Safety Net

The `autoExtractAndSave()` function runs regex-based extraction on every inbound message to capture name, email, budget, and timeline data **even if the AI fails to call `update_lead`**:

```typescript
try {
  const extractionResult = await autoExtractAndSave(contact.id, messageBody, contact);
  if (extractionResult.hasChanges) {
    log(`Auto-extracted: ${JSON.stringify(extractionResult)}`);
    // Refresh contact data
  }
} catch (extractErr) {
  logErr('Auto-extraction failed (non-fatal)', extractErr);
}
```

This is explicitly marked as **non-fatal** — extraction errors do not affect the main message flow.

---

# 9. KNOWN LIMITATIONS

## 9.1 Timezone Issues (Critical)

- **Slot generation uses server-local time:** `new Date().setHours()` operates in the server's OS timezone, not the tenant's configured timezone. This causes incorrect slot times when the server timezone differs from the tenant timezone.
- **Follow-up scheduling has the same issue:** `getNext930AM()` uses `Intl.DateTimeFormat` to read the current hour in the tenant's timezone but then sets hours using server-local `setHours()`.
- **Dashboard block modal uses browser timezone:** Blocks are stored based on the dashboard user's browser timezone, not the tenant's configured timezone.
- **No timezone library:** The project does not use `date-fns-tz`, `luxon`, or `dayjs` with timezone plugins. All timezone handling relies on native `Intl.DateTimeFormat` for formatting and `Date` for computation, which are mismatched.

## 9.2 Booking Race Conditions

- No database-level unique constraint on `(tenant_id, scheduled_time)` for appointments.
- `isSlotAvailable()` + `INSERT` is not atomic — concurrent bookings can result in double-bookings.
- **Mitigation:** Low probability in practice due to WhatsApp's sequential message processing per number.

## 9.3 Conversation Window Management

- The `close_conversation_windows()` PostgreSQL function exists but is **never called automatically** — requires an external cron job or Supabase scheduled function.
- Without this, old conversations remain `is_active: true` indefinitely, and the webhook handler will keep reusing them instead of creating new ones.
- The webhook handler has a repair mechanism (`if (!conversation.is_active)` → set `is_active: true`) but this masks the underlying issue.

## 9.4 AI Provider Limitations

- **No streaming:** AI responses are generated in full before sending, which means long responses may hit Twilio's API timeout.
- **No retry logic:** If the AI provider (Anthropic/OpenAI) returns a transient error (rate limit, server error), there is no automatic retry — the fallback message is sent immediately.
- **Tool call ordering:** Tools are executed sequentially in a loop, not in parallel. If the AI requests multiple tool calls, they execute one after another.
- **Single-turn tool use:** The AI gets one round of tool calls per message. It cannot call a tool, see the result, then call another tool based on that result (multi-step reasoning requires multiple customer messages).

## 9.5 Missing Features / Partial Implementations

- **Calendly/Google Calendar:** `CalendarService` factory and `ICalendarProvider` interface exist in `src/lib/services/calendar/index.ts`, but only the `inapp` provider is implemented. Calendly and Google Calendar provider files may not exist or are stubs.
- **Stripe billing:** `stripe_customer_id` and `conversation_usage` tables exist, but actual Stripe webhook handling and billing enforcement are minimal.
- **Email notifications for handoffs:** `notification_logs` and `notifications` tables exist, but email delivery of notifications to agents is not fully wired.
- **Multi-language AI prompts:** The `ai_prompts` table has a `language` field, but prompt selection does not consistently filter by the contact's language.
- **Media message handling:** The webhook captures `Body` text but does not process WhatsApp media (images, voice notes, documents).

## 9.6 Security Considerations

- **`@ts-nocheck` on most files:** TypeScript strict checking is disabled across almost all source files, reducing type safety.
- **Service role key used broadly:** `supabaseAdmin` bypasses RLS and is used in all server-side operations, including API routes that already have session authentication. A compromised API route could access any tenant's data.
- **Sensitive data in database:** `twilio_auth_token` and `calendly_api_key` are stored in the `tenants` table. The schema includes `encrypt_sensitive_data()` and `decrypt_sensitive_data()` functions, but it's unclear if they are consistently used for these fields.
- **Twilio signature verification:** Relies on `TWILIO_WEBHOOK_URL` env var matching the actual request URL. Proxy/CDN URL mismatches can cause signature verification to fail silently in development.

## 9.7 Dashboard Limitations

- **No real-time updates:** Calendar page fetches data on mount and month change only — no WebSocket or polling for live updates.
- **No appointment editing:** Dashboard shows appointments but has no UI to reschedule, confirm, or mark as completed/no-show.
- **Block time in browser TZ:** As noted in Section 6, blocked times are interpreted in the dashboard user's browser timezone.
- **Hardcoded timezone list:** Only 13 timezones are available in the dropdown. Tenants in unlisted timezones must use the closest match.

## 9.8 Database Schema Gaps

- `appointments` table has both `duration` and `duration_minutes` columns — the `bookSlot()` function writes to both, but queries may use either inconsistently.
- `contacts.metadata` JSONB is a grab-bag for various data (last slots, notes, booking info) with no schema validation.
- `webhook_events.idempotency_key` is auto-generated UUID, not derived from `MessageSid`, making the idempotency check rely on JSONB payload querying (`ilike` on `payload->>messageSid`).

---

# END OF SYSTEM ARCHITECTURE AUDIT

**Generated for:** WhatsApp Sales Concierge AI Platform
**Audit scope:** Complete system architecture including AI layer, database, calendar, timezone handling, error handling, and known limitations.
**Intended audience:** Senior AI systems engineer for debugging and onboarding.

