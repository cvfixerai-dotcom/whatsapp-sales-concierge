# AI SYSTEM COMPREHENSIVE INVESTIGATION REPORT
**Date:** March 2, 2026  
**Investigation Focus:** Calendar Booking Bugs & AI Tool Calling Issues

---

## EXECUTIVE SUMMARY

Based on code analysis, I've identified the current AI system configuration and several critical issues affecting calendar bookings. The system is configured to use **OpenAI (GPT-4o) as primary** with Anthropic as fallback, but there are issues with how tools are being called and how the system prompt is structured.

---

## PART 1: CURRENT AI PROVIDER CONFIGURATION

### Environment Variables Found
```bash
OPENAI_API_KEY: ✅ SET (active)
ANTHROPIC_API_KEY: ✅ SET (fallback)
```

### Provider Selection Logic
**Location:** `src/lib/ai/agent.ts:497-544`

```typescript
// --- Primary: OpenAI ---
const openaiKey = process.env.OPENAI_API_KEY || '';
if (openaiKey) {
  // Uses OpenAI with gpt-4o model
  const openaiModel = rawModel.replace(/^gpt-?4\.0(-turbo)?$/i, 'gpt-4o')...
  const openaiProvider = new OpenAIProvider(openaiKey, openaiModel);
  // ... calls OpenAI
} else {
  console.warn('[AI Agent] OPENAI_API_KEY not set, trying Anthropic directly');
}

// --- Fallback: Anthropic ---
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
if (anthropicKey) {
  // Falls back to Claude if OpenAI fails
}
```

**Current Active Provider:** **OpenAI (GPT-4o)**  
**Reason:** OPENAI_API_KEY is set and will be tried first

### Tenant Configuration
**Expected fields in database:**
- `ai_provider` - Can override default provider selection
- `ai_model` - Can specify model (e.g., 'gpt-4o', 'claude-3-5-sonnet')
- `timezone` - Used for calendar slot generation (default: 'Asia/Dubai')
- `industry` - Determines which prompt template to use
- `ai_assistant_name` - Name AI introduces itself as
- `agent_display_name` - Name shown in booking confirmations

**Note:** Need to query database to see actual values for Dubai Elite Properties tenant.

---

## PART 2: HOW TOOLS ARE CURRENTLY BEING USED

### Tools Array Definition
**Location:** `src/lib/ai/tools/index.ts:145-165`

```typescript
export function getAvailableTools(provider: string = 'anthropic'): any[] {
  if (provider === 'anthropic') {
    // Anthropic format
    return Object.values(AI_TOOLS).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  } else {
    // OpenAI format
    return Object.values(AI_TOOLS).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false,
      },
    }));
  }
}
```

### Available Tools
1. ✅ `update_lead` - Updates contact information
2. ✅ `check_calendar` - Retrieves available appointment slots
3. ✅ `book_appointment` - Books an appointment
4. ✅ `cancel_appointment` - Cancels an appointment
5. ✅ `send_email` - Sends email to customer

### How Tools Are Passed to OpenAI
**Location:** `src/lib/ai/agent.ts:505-516`

```typescript
const { getAvailableTools: getOpenAITools } = require('./tools');
const openaiTools = (params.tools && params.tools.length > 0) 
  ? getOpenAITools('openai') 
  : undefined;

// 🔍 DEBUG: Log tools being passed to OpenAI
if (openaiTools && openaiTools.length > 0) {
  console.log(`[AI Agent] Generated ${openaiTools.length} tools for OpenAI:`, 
    openaiTools.map(t => t.function.name).join(', '));
  console.log(`[AI Agent] First tool format:`, openaiTools[0]);
} else {
  console.log('[AI Agent] ⚠️ NO TOOLS generated for OpenAI (params.tools was empty)');
}

const response = await openaiProvider.call({ 
  ...callOptions, 
  ...(openaiTools ? { tools: openaiTools } : {}) 
});
```

**Location:** `src/lib/ai/providers/openai.ts:18-38`

```typescript
// 🔍 DEBUG: Log which tools are being sent to OpenAI
if (params.tools && params.tools.length > 0) {
  console.log('[OpenAI] Tools sent to OpenAI:', 
    params.tools.map(t => t.function.name).join(', '));
  console.log('[OpenAI] Tool choice: auto');
} else {
  console.log('[OpenAI] ⚠️ NO TOOLS sent to OpenAI');
}

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`,
  },
  body: JSON.stringify({
    model: this.model,
    messages,
    temperature: params.temperature || 0.7,
    max_tokens: params.maxTokens || 1000,
    ...(params.tools && params.tools.length > 0 
      ? { tools: params.tools, tool_choice: 'auto' } 
      : {}),
  }),
});
```

### Tool Choice Setting
**Current Setting:** `'auto'`  
**What this means:** OpenAI decides whether to call tools or respond with text  
**Problem:** With `'auto'`, the AI can choose NOT to call tools even when it should

### Tool Execution Flow
**Location:** `src/lib/ai/agent.ts:99-109`

```typescript
// 3. Call AI with tools
aiResponse = await this.callAI({
  provider: context.tenant.ai_provider,
  model: context.tenant.ai_model,
  systemPrompt,
  messages: conversationHistory,
  newMessage: params.messageContent,
  tools: this.getAvailableTools(context.tenant), // ← Tools passed here
  language: params.language,
  tenant: context.tenant,
  contact: context.contact,
});
```

---

## PART 3: SYSTEM PROMPT ANALYSIS

### System Prompt Construction
**Location:** `src/lib/ai/prompts.ts:420-438`

```typescript
export function buildSystemPrompt(
  tenant: any,
  contact: any,
  language: string,
  conversationHistory?: string
): string {
  return buildFullPrompt(
    tenant.industry || 'other',
    tenant.company_name || 'Our Company',
    tenant.services || [],
    tenant.business_hours || {},
    tenant.faqs || [],
    contact,
    conversationHistory || '',
    tenant.ai_system_prompt || undefined,  // ← Custom prompt from database
    tenant.ai_assistant_name || undefined,
    tenant.agent_display_name || undefined
  );
}
```

### System Prompt Components
**Location:** `src/lib/ai/prompts.ts:286-346`

The full prompt includes:
1. **CORE_RULES** (lines 12-109) - Universal rules for all industries
2. **INDUSTRY_CONTEXT** - Industry-specific instructions (real-estate, automotive, etc.)
3. **CUSTOM INSTRUCTIONS** - From `ai_prompts` table (if set)
4. **SERVICES OFFERED** - From tenant.services
5. **FAQs** - From tenant.faqs
6. **BUSINESS HOURS** - From tenant.business_hours
7. **CURRENT LEAD STATUS** - Contact data injected dynamically

### CORE_RULES - Tool Usage Instructions
**Location:** `src/lib/ai/prompts.ts:41-79`

```
TOOL USAGE (MANDATORY - NOT OPTIONAL):
update_lead:
→ This tool is MANDATORY. You MUST call it before responding when customer shares ANY of these:
  • Email address → Call update_lead({ email: "..." }) FIRST, then respond
  • Name → Call update_lead({ name: "..." }) FIRST, then respond
  • Budget → Call update_lead({ budget_range: "..." }) FIRST, then respond
  ...

check_calendar:
→ 🔥 MANDATORY: You MUST call check_calendar BEFORE offering ANY appointment times
→ NEVER make up times like "1pm, 2pm, 3pm" - this causes booking failures
→ NEVER say "I have these times available" without calling check_calendar first
→ Each slot has: datetime (ISO), formatted (display), dayName, dateOnly
→ CRITICAL: Always use the dayName field when mentioning days
→ If tool returns NO available slots → "Let me check with the team..."

book_appointment:
→ Call when customer confirms a specific time from the slots you offered
→ 🔥 CRITICAL: Use the EXACT datetime (ISO string) from check_calendar results
→ NEVER construct or guess a datetime - only use values from check_calendar
→ If customer says "2pm" → find the slot from check_calendar with time="2:00 PM" 
  → use that slot's datetime
```

### BOOKING FLOW Instructions
**Location:** `src/lib/ai/prompts.ts:91-102`

```
BOOKING FLOW (exact sequence - DO NOT SKIP STEPS):
STEP 1: GREET
STEP 2: GET NAME → Call update_lead immediately
STEP 3: QUALIFY → Ask ONE question at a time, call update_lead after each answer
STEP 4: GET EMAIL → Timing depends on urgency
STEP 5: CHECK CALENDAR — 🔥 MANDATORY: Call check_calendar, wait for tool results
STEP 6: PRESENT SLOTS — Use ONLY the slots returned by check_calendar
  Example: "I have Monday, March 2 at 1:00 PM, 1:30 PM, or 2:00 PM. Which works?"
  🚫 NEVER say times without calling check_calendar first
STEP 7: BOOK — Call book_appointment with the EXACT datetime from the slot they chose
  If user says "2pm" → find slot where formatted contains "2:00 PM" → use that slot's datetime
STEP 8: CONFIRM
```

### Current Lead Status Injection
**Location:** `src/lib/ai/prompts.ts:334-345`

```
CURRENT LEAD STATUS:
- Name: ${contact.name || 'unknown'}
- Email: ${contact.email || 'not collected yet'}
- Temperature: ${contact.temperature || 'new'}
- Score: ${contact.lead_score || 0}/100
- Timeline: ${contact.timeline || 'unknown'}
- Budget: ${contact.budget_range || 'unknown'}
- Service Interest: ${contact.service_interest || 'unknown'}
- Last Contact: ${contact.last_message_at || contact.updated_at || 'unknown'}

RECENT CONVERSATION:
${conversationHistory || 'This is the first message from this customer.'}
```

---

## PART 4: CHECK_CALENDAR TOOL INVESTIGATION

### Tool Definition
**Location:** `src/lib/ai/tools/index.ts:33-46`

```typescript
check_calendar: {
  name: 'check_calendar',
  description: 'MANDATORY: Check available appointment/meeting slots. You MUST call this tool BEFORE offering any appointment times to the customer. NEVER make up times like "1pm, 2pm, 3pm" - always get real availability from this tool first.',
  parameters: {
    type: 'object',
    properties: {
      preferredDate: { 
        type: 'string', 
        description: 'Customer preferred date if mentioned (ISO format or natural language)' 
      },
      preferredTime: { 
        type: 'string', 
        description: 'Customer preferred time if mentioned' 
      },
      daysAhead: { 
        type: 'number', 
        description: 'Number of days to search ahead (default 7)', 
        minimum: 1, 
        maximum: 60 
      },
    },
    required: [],
    additionalProperties: false,
  },
  handler: 'checkCalendar',
}
```

### Implementation Analysis
**Location:** `src/lib/ai/tools/check-calendar.ts:115-210`

**How it works:**
1. Loads availability settings from database (business hours, timezone, etc.)
2. Calls `getAvailableSlots()` from `src/lib/services/calendar/inapp.ts`
3. Filters slots based on preferred date/time if provided
4. Stores last offered slots in `contacts.metadata.calendar_last_slots`
5. Returns slots with: `datetime` (ISO), `formatted`, `dayName`, `dateOnly`

**Logging added:**
```typescript
console.log('\n=== 📅 CHECK CALENDAR TOOL ===');
console.log(`[Tool: checkCalendar] Tenant: ${tenantId}`);
console.log(`[Tool: checkCalendar] Timezone: ${timezone}`);
console.log(`[Tool: checkCalendar] Business hours:`, {...});
console.log(`[Tool: checkCalendar] Total slots generated: ${slots.length}`);
console.log(`[Tool: checkCalendar] Returning ${slotsToReturn.length} slots to AI`);
console.log('[Tool: checkCalendar] First 3 slots:', slotsToReturn.slice(0, 3)...);
console.log('=== END CHECK CALENDAR ===\n');
```

### Slot Generation Logic
**Location:** `src/lib/services/calendar/inapp.ts:69-207`

**Process:**
1. Loads availability settings (business hours, timezone, slot duration, etc.)
2. Fetches existing booked appointments from database
3. Fetches blocked time slots from database
4. For each day in the search window:
   - Check if day is enabled (e.g., monday_enabled = true)
   - Get business hours for that day (e.g., monday_start = '09:00', monday_end = '17:00')
   - Generate slots at intervals (slot_duration + buffer_time)
   - Filter out: past times, booked slots, blocked slots, min notice violations
5. Returns slots with timezone-aware formatting

**Timezone handling:**
```typescript
const timezone = settings.timezone || 'Asia/Dubai';

// Slots are stored as ISO strings (UTC)
datetime: slotDate.toISOString(),

// But formatted for display in tenant's timezone
formatted: slotDate.toLocaleString('en-US', {
  weekday: 'long', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
  timeZone: timezone,  // ← Uses tenant timezone for display
}),
```

---

## PART 5: BOOK_APPOINTMENT TOOL INVESTIGATION

### Tool Definition
**Location:** `src/lib/ai/tools/index.ts:49-61`

```typescript
book_appointment: {
  name: 'book_appointment',
  description: 'Book a confirmed appointment. Call this after the customer agrees to a specific time slot. CRITICAL: You must pass the EXACT datetime (ISO string) from check_calendar results - never construct or guess a datetime.',
  parameters: {
    type: 'object',
    properties: {
      slotTime: { 
        type: 'string', 
        description: 'The EXACT datetime ISO string from check_calendar results (e.g., "2026-03-02T14:00:00+04:00"). When customer says "2pm", find the slot from check_calendar with that time and use its datetime value.', 
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}' 
      },
    },
    required: ['slotTime'],
    additionalProperties: false,
  },
  handler: 'bookAppointment',
}
```

### Implementation Analysis
**Location:** `src/lib/ai/tools/book-appointment.ts:59-193`

**Critical flow:**
1. **Validates ISO format** - Rejects non-ISO input
2. **Resolves from last offered slots** - Matches against `contacts.metadata.calendar_last_slots`
3. **If no match found** - Returns error (this is where bookings fail!)
4. **Books the slot** - Calls `bookSlot()` to insert into database
5. **Updates contact** - Sets temperature to 'booked'
6. **Sends confirmation email** - If email exists

**The matching logic:**
```typescript
async function resolveFromLastOfferedSlots(
  isoDatetime: string,
  contactId: string
): Promise<string | null> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('metadata')
    .eq('id', contactId)
    .single();

  const lastSlots: any[] = Array.isArray(contact?.metadata?.calendar_last_slots)
    ? contact.metadata.calendar_last_slots
    : [];

  if (!lastSlots.length) {
    return null;  // ← NO SLOTS = BOOKING FAILS
  }

  const inputMs = new Date(isoDatetime).getTime();
  const match = lastSlots.find(slot => {
    const slotMs = new Date(slot.datetime).getTime();
    return slotMs === inputMs;  // ← Exact millisecond match required
  });

  return match ? match.datetime : null;
}
```

**Logging added:**
```typescript
console.log('\n=== 📝 BOOK APPOINTMENT TOOL ===');
console.log(`[Tool: bookAppointment] Contact: ${contactId}`);
console.log(`[Tool: bookAppointment] Slot time input from AI: "${slotTime}"`);
console.log(`[Tool: bookAppointment] ✅ ISO format validated`);
console.log(`[Tool: bookAppointment] Resolved ISO from last offered slots: ${resolvedIso || 'NOT FOUND'}`);

if (!resolvedIso) {
  console.error('[Tool: bookAppointment] ❌ SLOT NOT FOUND IN LAST OFFERED SLOTS');
  console.error('[Tool: bookAppointment] This means check_calendar was not called, or AI passed wrong datetime');
}
```

---

## PART 6: TIMEZONE HANDLING ANALYSIS

### Timezone Flow Through System

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INPUT (WhatsApp)                                    │
│    "I need a viewing at 2pm tomorrow"                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. AI RECEIVES (System Prompt)                              │
│    User message in plain text                               │
│    No timezone info at this stage                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. AI CALLS check_calendar                                  │
│    Parameters: { preferredTime: "2pm", preferredDate: ... } │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. check_calendar GENERATES SLOTS                           │
│    - Loads tenant.timezone (e.g., "Asia/Dubai" = UTC+4)     │
│    - Generates slots in LOCAL time                          │
│    - Stores as ISO (UTC): "2026-03-02T10:00:00.000Z"        │
│    - Formats for display: "Monday, March 2 at 2:00 PM"      │
│      (using timeZone: 'Asia/Dubai')                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. AI RECEIVES SLOTS                                        │
│    [                                                         │
│      {                                                       │
│        datetime: "2026-03-02T10:00:00.000Z",  ← UTC         │
│        formatted: "Monday, March 2 at 2:00 PM", ← Dubai     │
│        dayName: "Monday",                                    │
│        dateOnly: "Mar 2, 2026"                               │
│      }                                                       │
│    ]                                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. AI PRESENTS TO USER                                      │
│    "I have Monday, March 2 at 2:00 PM. Does that work?"     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. USER CONFIRMS                                            │
│    "Yes, 2pm works"                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. AI CALLS book_appointment                                │
│    { slotTime: "2026-03-02T10:00:00.000Z" }  ← Must be exact│
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. DATABASE STORAGE                                         │
│    appointments.scheduled_time = "2026-03-02T10:00:00.000Z" │
│    (PostgreSQL timestamptz - stores in UTC)                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. DASHBOARD DISPLAY                                       │
│     Converts UTC → Dubai timezone for display               │
│     Shows: "Monday, March 2 at 2:00 PM"                     │
└─────────────────────────────────────────────────────────────┘
```

### Timezone Conversion Points

1. **Slot Generation** (`inapp.ts:69-207`)
   - Uses `settings.timezone` (e.g., 'Asia/Dubai')
   - Generates slots in local business hours
   - Stores as ISO UTC
   - Formats with `toLocaleString(..., { timeZone: timezone })`

2. **Database Storage**
   - All times stored as `timestamptz` (UTC)
   - PostgreSQL handles timezone conversion

3. **Dashboard Display**
   - Should convert UTC → tenant timezone
   - Need to verify this is working correctly

---

## PART 7: IDENTIFIED ISSUES

### 🔴 CRITICAL ISSUE #1: AI Not Calling check_calendar

**Evidence from screenshots:**
- Sarah says: "I have these available times... 1:00 PM, 1:30 PM, or 2:00 PM"
- No `check_calendar` tool call was made
- Times were fabricated by the AI

**Root Cause:**
Despite the prompt saying "MANDATORY" and "🔥", the AI is still choosing NOT to call the tool because:

1. **tool_choice is set to 'auto'** - OpenAI can choose to ignore tools
2. **Prompt may not be strong enough** - AI interprets instructions as suggestions
3. **No enforcement mechanism** - System doesn't reject responses without tool calls

**Why this happens:**
```typescript
// In openai.ts:29
{ tools: params.tools, tool_choice: 'auto' }
//                      ^^^^^^^^ AI decides whether to call tools
```

With `tool_choice: 'auto'`, OpenAI's behavior:
- Reads the prompt instructions
- Sees "check available times"
- Decides it can answer without calling the tool
- Makes up plausible times (1pm, 2pm, 3pm)
- Responds with text instead of tool call

### 🔴 CRITICAL ISSUE #2: Wrong Time Being Booked

**Evidence:**
- User says: "2pm"
- Sarah confirms: "Monday, March 2 at 6:00 PM" (18:00)
- Dashboard shows: "07:30 PM" (19:30)

**Root Cause Chain:**
1. AI didn't call `check_calendar`, so no slots stored in `contacts.metadata.calendar_last_slots`
2. AI makes up a datetime string (possibly wrong timezone calculation)
3. `book_appointment` tries to resolve from last offered slots
4. Finds nothing (because check_calendar wasn't called)
5. Should return error, but something is bypassing validation
6. Books with wrong time

**The validation that should catch this:**
```typescript
// book-appointment.ts:84-93
if (!resolvedIso) {
  console.error('[Tool: bookAppointment] ❌ SLOT NOT FOUND');
  return {
    success: false,
    error: 'The selected time was not in the recently offered slots...'
  };
}
```

**Question:** Is the AI even calling `book_appointment`? Or is it just saying "booked" without calling the tool?

### 🔴 CRITICAL ISSUE #3: Timezone Display Mismatch

**Evidence:**
- Confirmation message shows one time
- Dashboard shows different time
- Both are wrong

**Possible causes:**
1. AI is constructing datetime in wrong timezone
2. Dashboard is converting incorrectly
3. Database is storing wrong value

**Need to verify:**
- What's actually in the database?
- How is dashboard converting for display?
- Is tenant.timezone being used consistently?

---

## PART 8: LOGGING ANALYSIS

### Current Logging Coverage

**✅ Already Logged:**
1. Tools being generated for OpenAI
2. Tools being sent to OpenAI API
3. Tool calls received from OpenAI
4. Tool execution results
5. check_calendar: business hours, slots generated, timezone
6. book_appointment: slot matching, booking success/failure

**❌ Missing Logs:**
1. **Full system prompt** - What exact prompt is sent to AI?
2. **Full messages array** - What conversation history is sent?
3. **Raw OpenAI response** - What does OpenAI actually return?
4. **Tool call parameters** - What parameters is AI passing to tools?
5. **Contact metadata** - What's stored in calendar_last_slots?

### Recommended Additional Logging

```typescript
// In agent.ts - before calling AI
console.log('=== FULL SYSTEM PROMPT ===');
console.log(systemPrompt);
console.log('=== END SYSTEM PROMPT ===\n');

console.log('=== MESSAGES ARRAY ===');
console.log(JSON.stringify(conversationHistory, null, 2));
console.log('=== END MESSAGES ===\n');

// In openai.ts - after receiving response
console.log('=== RAW OPENAI RESPONSE ===');
console.log(JSON.stringify(data, null, 2));
console.log('=== END RESPONSE ===\n');

// In check-calendar.ts - after storing slots
console.log('=== STORED IN METADATA ===');
console.log(JSON.stringify(contact.metadata.calendar_last_slots, null, 2));
console.log('=== END METADATA ===\n');
```

---

## PART 9: RECOMMENDATIONS

### 🎯 IMMEDIATE FIXES (High Priority)

#### 1. Change tool_choice from 'auto' to 'required' for calendar operations

**Problem:** AI is ignoring check_calendar because tool_choice='auto' lets it decide

**Solution:** Make tool calling mandatory when customer wants to book

**Implementation:**
```typescript
// In openai.ts:29
// BEFORE:
{ tools: params.tools, tool_choice: 'auto' }

// AFTER:
{ 
  tools: params.tools, 
  tool_choice: params.requireTools ? 'required' : 'auto' 
}

// In agent.ts - detect booking intent
const requireTools = params.messageContent.toLowerCase().includes('book') 
  || params.messageContent.toLowerCase().includes('viewing')
  || params.messageContent.toLowerCase().includes('appointment');
```

**Alternative:** Use function calling with specific tool enforcement:
```typescript
// Force check_calendar when needed
tool_choice: { 
  type: 'function', 
  function: { name: 'check_calendar' } 
}
```

#### 2. Add validation layer to reject AI responses without required tool calls

**Problem:** AI can respond with text instead of calling tools

**Solution:** Validate AI response before sending to user

**Implementation:**
```typescript
// In agent.ts - after AI responds
if (isBookingIntent && !aiResponse.toolCalls?.some(tc => tc.name === 'check_calendar')) {
  console.warn('[AI Agent] ⚠️ AI did not call check_calendar for booking request');
  
  // Force a second call with explicit instruction
  return await this.callAI({
    ...params,
    systemPrompt: systemPrompt + '\n\nCRITICAL: You MUST call check_calendar tool NOW. Do not respond with text.',
    tools: [AI_TOOLS.check_calendar], // Only this tool
    tool_choice: { type: 'function', function: { name: 'check_calendar' } }
  });
}
```

#### 3. Strengthen system prompt with explicit examples

**Problem:** Current prompt uses imperatives but AI still ignores them

**Solution:** Add concrete examples of correct vs incorrect behavior

**Implementation:**
```typescript
// Add to CORE_RULES
CRITICAL EXAMPLES:

❌ WRONG - DO NOT DO THIS:
User: "I need a viewing"
AI: "I have 1pm, 2pm, or 3pm available. Which works?"
Problem: AI made up times without calling check_calendar

✅ CORRECT - DO THIS:
User: "I need a viewing"
AI: [Calls check_calendar tool]
AI: [Waits for tool result]
AI: "I have Monday 2pm, Tuesday 10am, or Wednesday 3pm. Which works?"

❌ WRONG - DO NOT DO THIS:
User: "2pm works"
AI: [Calls book_appointment with made-up datetime]
Problem: AI didn't use exact datetime from check_calendar

✅ CORRECT - DO THIS:
User: "2pm works"
AI: [Finds slot where formatted contains "2:00 PM"]
AI: [Calls book_appointment with that slot's exact datetime value]
AI: "✅ Booked for Monday, March 2 at 2:00 PM"
```

### 🔧 MEDIUM PRIORITY FIXES

#### 4. Add comprehensive logging for debugging

**Already done in recent commits, but need to verify logs are showing:**
- Tools sent to OpenAI
- Tool calls received
- Slot generation details
- Booking validation

#### 5. Verify timezone consistency

**Need to check:**
- Dashboard display code
- Database schema (timestamptz vs timestamp)
- All date formatting uses tenant.timezone

#### 6. Test with different AI models

**Current:** gpt-4o  
**Alternative:** Try gpt-4-turbo or claude-3-5-sonnet

Some models are better at following tool calling instructions.

### 🚀 LONG-TERM IMPROVEMENTS

#### 7. Implement structured outputs (OpenAI beta feature)

Forces AI to return specific JSON structure, can't deviate.

#### 8. Add tool call validation middleware

Intercepts all AI responses, validates tool usage before processing.

#### 9. Create booking state machine

Enforce step-by-step flow: greet → qualify → check_calendar → present → book

#### 10. Add automated testing

Test that AI always calls check_calendar before offering times.

---

## PART 10: NEXT STEPS FOR INVESTIGATION

### To Complete This Investigation, We Need:

1. **Run the investigation script** to get actual tenant configuration
2. **Check recent conversation logs** to see what AI actually did
3. **Query appointments table** to see what times were stored
4. **Test booking flow** with enhanced logging enabled
5. **Capture full OpenAI API request/response** for a booking attempt

### Commands to Run:

```bash
# 1. Get tenant configuration
npx tsx scripts/investigate-ai-config.ts

# 2. Check recent messages with tool calls
# (Need to create SQL query script)

# 3. Test booking flow
# Send test WhatsApp message: "I need a viewing tomorrow at 2pm"
# Monitor logs for:
# - Tools sent to OpenAI
# - AI response (tool calls or text?)
# - check_calendar execution
# - book_appointment execution
```

---

## CONCLUSION

**Current State:**
- ✅ OpenAI (GPT-4o) is the active AI provider
- ✅ All 5 tools are defined and passed to OpenAI
- ✅ System prompt includes mandatory tool usage instructions
- ✅ Logging has been added to track tool execution
- ❌ tool_choice='auto' allows AI to ignore tools
- ❌ AI is making up times instead of calling check_calendar
- ❌ Bookings are failing or storing wrong times

**Root Cause:**
The AI is not calling `check_calendar` because `tool_choice='auto'` gives it the option to respond with text instead of calling tools. Even with "MANDATORY" in the prompt, the AI interprets this as a strong suggestion rather than an absolute requirement.

**Recommended Fix Priority:**
1. **IMMEDIATE:** Change tool_choice to 'required' or use function-specific enforcement
2. **IMMEDIATE:** Add validation to reject responses without required tool calls
3. **IMMEDIATE:** Test with enhanced logging to confirm fix
4. **SHORT-TERM:** Strengthen prompt with explicit examples
5. **MEDIUM-TERM:** Verify timezone handling throughout system
6. **LONG-TERM:** Implement structured outputs and state machine

**Next Action:**
Run the investigation script to get actual tenant data, then implement the immediate fixes and test with a real booking scenario.

