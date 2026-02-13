# In-App Calendar + WhatsApp Chat + Human Handoff — System Architecture

## Overview

This system adds three major capabilities to the WhatsApp Sales Concierge:

1. **In-App Calendar** — A built-in appointment scheduling system that works without external providers (Calendly/Google).
2. **WhatsApp-Style Dashboard Chat** — Agents can reply to customers directly from the dashboard, with messages sent via Twilio WhatsApp.
3. **Human Handoff** — When a human agent takes over a conversation, the AI stops responding automatically.

---

## 1. In-App Calendar System

### How It Works (End-to-End Flow)

```
Customer on WhatsApp          AI Agent                    In-App Calendar Service
        |                        |                               |
        |-- "Can I book?"------>|                               |
        |                        |-- checkCalendar(tenantId) -->|
        |                        |                               |-- Query availability_settings
        |                        |                               |-- Query appointments (booked)
        |                        |                               |-- Query blocked_slots
        |                        |                               |-- Generate available slots
        |                        |<-- [slot1, slot2, slot3] ----|
        |<-- "Here are times:" --|                               |
        |                        |                               |
        |-- "Tuesday 10am" ---->|                               |
        |                        |-- bookAppointment(slot) ---->|
        |                        |                               |-- isSlotAvailable() check
        |                        |                               |-- INSERT into appointments
        |                        |<-- { success, appointment } -|
        |<-- "Confirmed!" ------|                               |
```

### Database Tables

#### `availability_settings` (1 row per tenant)
Controls the weekly schedule and booking rules:
- **Weekly hours**: `monday_start/end/enabled` through `sunday_start/end/enabled`
- **Slot duration**: default 30 minutes
- **Buffer time**: gap between appointments (default 0)
- **Max per day**: cap on daily bookings (default 20)
- **Booking window**: how far ahead customers can book (default 30 days)
- **Min notice**: minimum hours before a slot can be booked (default 2 hours)
- **Timezone**: used for slot formatting (default Asia/Dubai)

#### `blocked_slots`
Ad-hoc time blocks (holidays, lunch, personal time):
- `start_time`, `end_time` (TIMESTAMPTZ)
- `reason` (text)
- `is_recurring` (for future use)

#### `appointments` (augmented)
New columns added:
- `customer_name`, `customer_phone`, `customer_email`
- `duration` (minutes)
- `appointment_type` (e.g., "general", "consultation")
- `booked_via` ("whatsapp", "dashboard")
- `notes`, `reminder_sent_at`, `confirmation_sent_at`

### Slot Generation Algorithm (`inapp.ts → getAvailableSlots`)

1. Load `availability_settings` for the tenant (or use defaults).
2. Fetch all `appointments` with status `scheduled` or `confirmed` in the date range.
3. Fetch all `blocked_slots` overlapping the date range.
4. For each day in the requested range:
   - Skip if that day of week is disabled.
   - Skip if daily booking count ≥ `max_per_day`.
   - Generate time slots from `day_start` to `day_end` in `slot_duration + buffer_time` increments.
   - **Filter out** slots that:
     - Are before `now + min_notice_hours`
     - Are already booked (exact match on timestamp)
     - Overlap with any blocked range
     - Are beyond `booking_window_days` from now
5. Return array of `{ datetime, formatted, date, time }`.

### Double-Booking Prevention (`isSlotAvailable`)

Before any booking, the system checks:
1. No existing appointment overlaps the requested time window.
2. No blocked slot overlaps the requested time window.
Only if both pass does the booking proceed.

### AI Tool Integration

#### `check-calendar.ts` (AI tool)
Priority order:
1. **External calendar** (Calendly or Google) — if API keys are configured and the provider returns slots.
2. **In-app calendar** — fallback if external isn't configured or fails.
3. **Emergency fallback** — if everything fails, tries in-app one more time.

#### `book-appointment.ts` (AI tool)
Priority order:
1. **External calendar** — tries to book via Calendly/Google API first.
2. **In-app booking** — if external fails or isn't configured:
   - Calls `isSlotAvailable()` to prevent double-booking.
   - Inserts into `appointments` table with `calendar_provider: 'inapp'`.
3. Regardless of path: updates lead temperature to "booked", sends confirmation email if email exists.

### API Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/calendar/slots` | GET | Session | Returns available slots. Query: `?date=2024-02-15&days=7` |
| `/api/calendar/book` | POST | Session | Books a slot. Body: `{ scheduled_at, customer_name, customer_phone, ... }` |
| `/api/calendar/availability` | GET | Session | Returns tenant's availability settings (or defaults) |
| `/api/calendar/availability` | POST | Session | Saves/updates availability settings |

### Dashboard UI

**Availability Settings** (`/dashboard/calendar/availability`):
- Toggle each day on/off with start/end time pickers.
- Configure slot duration, buffer, max/day, booking window, min notice, timezone.
- Save button persists via POST `/api/calendar/availability`.
- Linked from the main calendar page header.

---

## 2. WhatsApp-Style Dashboard Chat

### How It Works

```
Agent in Dashboard                    Reply API                    Twilio
       |                                |                           |
       |-- types message, hits Send -->|                           |
       |                                |-- lookup conversation --->|
       |                                |-- lookup contact -------->|
       |                                |-- sendWhatsAppMessage() ----------->|
       |                                |                           |-- delivers to customer
       |                                |-- INSERT into messages ---|
       |                                |-- UPDATE conversation     |
       |                                |   status='human_active'   |
       |<-- { success, message } ------|                           |
```

### Reply API (`POST /api/conversations/reply`)

**Request**: `{ conversation_id, content }`

**Flow**:
1. Authenticate via NextAuth session → get `tenantId`.
2. Look up the conversation (must belong to this tenant).
3. Look up the contact's `whatsapp_number`.
4. Send the message via `twilioService.sendWhatsAppMessage()` (bypasses rate limit).
5. Save message to `messages` table with `sender_type: 'human'`, `direction: 'outbound'`.
6. Update conversation: `status → 'human_active'`, `assigned_agent_id → agent's ID`.
7. Return the saved message object.

**Error handling**:
- If Twilio fails → returns 502 (message NOT saved).
- If DB save fails after Twilio succeeds → returns success (message was delivered).

### Chat UI (`/dashboard/conversations/[id]`)

**WhatsApp-style design**:
- **Header**: Dark green (`#075e54`) with contact avatar, name, phone, AI/Human badge, Take Over / Hand Back button.
- **Messages area**: Beige background (`#ECE5DD`), white bubbles for inbound, green (`#d9fdd3`) for outbound.
- **Sender labels**: "AI Assistant" (blue) or "Agent" (green) on outbound messages.
- **Date separators**: WhatsApp-style centered date pills when the day changes.
- **Timestamps**: Small gray text with Bot/UserCheck icons.
- **Input bar**: Always visible at bottom. Disabled with "Take over to reply..." placeholder when AI is handling. Round send button with loading spinner.
- **Suggested responses**: Horizontal chip bar above input when in human mode.
- **Send errors**: Red bar with error message, auto-clears after 5 seconds.

### Realtime Updates

The page subscribes to Supabase Realtime:
- `INSERT` on `messages` → new messages appear instantly.
- `UPDATE` on `conversations` → detects when another agent takes over.

---

## 3. Human Handoff System

### How It Works

```
             Customer sends message
                      |
                      v
            Twilio Webhook receives it
                      |
                      v
            Save message to DB (always)
                      |
                      v
         conversation.status == 'human_active'?
                /              \
              YES                NO
               |                  |
               v                  v
         Skip AI processing    Run AI agent
         (message visible       (AI responds
          to human agent         automatically)
          in dashboard)
```

### Status Values

| Status | Meaning | AI Responds? |
|---|---|---|
| `active` | Normal conversation | YES |
| `human_active` | Human agent is handling | NO |
| `human-handled` | Legacy status, same as human_active | NO |
| `closed` | Conversation ended | NO (no messages expected) |

### Takeover Toggle

**Take Over** (agent clicks button):
1. Sets `conversation.status = 'human_active'`
2. Sets `conversation.assigned_agent_id = agent's user ID`
3. Input box becomes active, agent can type and send.

**Hand Back to AI** (agent clicks button):
1. Sets `conversation.status = 'active'`
2. Sets `conversation.assigned_agent_id = null`
3. Input box becomes disabled, AI resumes responding.

### Webhook Logic (`/api/webhook/twilio`)

At step 9 of the webhook handler:
```typescript
if (conversation.status === 'human_active' || conversation.status === 'human-handled') {
  log('Skipping AI, message saved for human agent');
} else {
  // Run AI processing
  await aiAgent.processInboundMessage({ ... });
}
```

**Key point**: The inbound message is ALWAYS saved to the database regardless of status. Only the AI response is skipped. This ensures the human agent sees every message in the dashboard chat.

---

## 4. Data Flow Summary

### Customer Books via WhatsApp
1. Customer sends "I want to book" → Twilio webhook → AI agent
2. AI calls `checkCalendar` tool → in-app service generates slots
3. AI presents slots to customer
4. Customer picks a slot → AI calls `bookAppointment` tool
5. `isSlotAvailable()` verifies → INSERT appointment → update lead temperature
6. AI confirms booking to customer

### Agent Books via Dashboard
1. Agent opens `/api/calendar/slots?days=7` → sees available slots
2. Agent POSTs to `/api/calendar/book` with slot + customer info
3. Same `bookSlot()` service: availability check → INSERT → return

### Agent Replies via Dashboard
1. Agent opens conversation → sees WhatsApp-style chat
2. Agent clicks "Take Over" → status = human_active
3. Agent types message → POST `/api/conversations/reply`
4. Twilio sends WhatsApp → message saved → conversation stays human_active
5. Customer replies → webhook saves message but skips AI
6. Agent sees new message via Supabase Realtime
7. Agent clicks "Hand Back to AI" → status = active → AI resumes

---

## 5. File Map

| File | Purpose |
|---|---|
| `supabase/migrations/20240210_add_inapp_calendar.sql` | DB migration |
| `src/lib/services/calendar/inapp.ts` | Core calendar service |
| `src/app/api/calendar/slots/route.ts` | GET available slots |
| `src/app/api/calendar/book/route.ts` | POST book appointment |
| `src/app/api/calendar/availability/route.ts` | GET/POST availability settings |
| `src/app/api/conversations/reply/route.ts` | POST send WhatsApp reply |
| `src/app/api/webhook/twilio/route.ts` | Webhook with human handoff check |
| `src/lib/ai/tools/check-calendar.ts` | AI tool: check availability |
| `src/lib/ai/tools/book-appointment.ts` | AI tool: book appointment |
| `src/app/dashboard/calendar/availability/page.tsx` | Availability settings UI |
| `src/app/dashboard/conversations/[id]/page.tsx` | WhatsApp-style chat UI |
| `src/app/dashboard/calendar/page.tsx` | Calendar dashboard (link added) |

---

## 6. Prerequisites

1. **Run the migration SQL** on Supabase to create `availability_settings` and `blocked_slots` tables and add new appointment columns.
2. **Twilio credentials** must be configured for the tenant (for reply API to work).
3. **NextAuth session** must be active (all API routes require authentication).
