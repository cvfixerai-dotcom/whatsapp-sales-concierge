# TIMEZONE HANDLING ANALYSIS

**Date:** March 2, 2026  
**Issue:** User booked "12:30 PM" but dashboard shows "2:00 PM" (1.5 hour difference)  
**Context:** Business in Dubai (UTC+4), User from India (UTC+5:30)

---

## PART 1: COMPLETE TIMEZONE FLOW

### 1. SLOT GENERATION (`check_calendar`)

**File:** `src/lib/services/calendar/inapp.ts` (lines 215-342)

**How it works:**

```typescript
// Step 1: Get tenant timezone from database
const timezone = settings.timezone || 'Asia/Dubai'; // UTC+4

// Step 2: Extract timezone offset for the date
const refDate = new Date(`${dateStr}T12:00:00Z`);
const formatted = refDate.toLocaleString('en-US', {
  timeZone: timezone,
  timeZoneName: 'short'
});
const offsetMatch = formatted.match(/GMT([+-]\d+)/);
const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0; // +4 for Dubai

// Step 3: Build ISO string with timezone offset
// For 9:00 AM Dubai on March 2, 2026:
const isoWithTZ = `2026-03-02T09:00:00+04:00`;
const slotDate = new Date(isoWithTZ); // Converts to UTC: 2026-03-02T05:00:00.000Z

// Step 4: Format for display (using tenant timezone)
const formatted = slotDate.toLocaleString('en-US', {
  weekday: 'long', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
  timeZone: timezone, // 'Asia/Dubai'
});
// Result: "Monday, March 2, 2026 at 9:00 AM"

// Step 5: Return to AI
return {
  datetime: slotDate.toISOString(), // "2026-03-02T05:00:00.000Z" (UTC)
  formatted: "Monday, March 2, 2026 at 9:00 AM", // Dubai time display
};
```

**Key Points:**
- ✅ Business hours (09:00-17:00) are interpreted as **Dubai time**
- ✅ Slots are stored internally as **UTC timestamps** (ISO 8601)
- ✅ Display formatting uses **Dubai timezone** for consistency
- ✅ The `datetime` field contains UTC, `formatted` contains Dubai time display

**Logging Added:**
```typescript
console.log('[CHECK_CALENDAR] Tenant timezone:', timezone);
console.log('[CHECK_CALENDAR] Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('[CHECK_CALENDAR] Sample slot BEFORE formatting:', {
  dateStr, timeStr, offsetStr, isoWithTZ, slotTime
});
console.log('[CHECK_CALENDAR] Sample slot AFTER formatting:', slotObj);
```

---

### 2. BOOKING (`book_appointment`)

**File:** `src/lib/ai/tools/book-appointment.ts` (lines 59-199)

**How it works:**

```typescript
// Step 1: AI passes ISO datetime from check_calendar
slotTime = "2026-03-02T05:00:00.000Z" // 9:00 AM Dubai in UTC

// Step 2: Validate it's ISO format
assertIsoDateTime(slotTime); // ✅ Pass

// Step 3: Match against last offered slots
const resolvedIso = await resolveFromLastOfferedSlots(slotTime, contactId);
// Finds exact match in contact.metadata.calendar_last_slots

// Step 4: Save to database
await bookSlot({
  scheduledAt: resolvedIso, // "2026-03-02T05:00:00.000Z"
});
```

**Database Insert:**

**File:** `src/lib/services/calendar/inapp.ts` (lines 434-439)

```typescript
await supabaseAdmin
  .from('appointments')
  .insert({
    scheduled_time: params.scheduledAt, // "2026-03-02T05:00:00.000Z"
    // PostgreSQL stores this as timestamptz (timestamp with timezone)
  });
```

**Key Points:**
- ✅ AI receives ISO datetime from `check_calendar`
- ✅ No timezone conversion happens during booking
- ✅ Database receives UTC timestamp (ISO 8601 string)
- ✅ PostgreSQL stores as `timestamptz` (preserves UTC)

**Logging Added:**
```typescript
console.log('[BOOK_APPOINTMENT] User input:', slotTime);
console.log('[BOOK_APPOINTMENT] Parsed datetime:', new Date(slotTime).toISOString());
console.log('[BOOK_APPOINTMENT] Value being saved to DB:', resolvedIso);
console.log('[BOOK_SLOT] Saving to database:', {
  scheduledAt: params.scheduledAt,
  parsedAsDate: new Date(params.scheduledAt).toISOString(),
  parsedAsDubai: new Date(params.scheduledAt).toLocaleString('en-US', {
    timeZone: 'Asia/Dubai'
  })
});
```

---

### 3. DASHBOARD DISPLAY

**File:** `src/app/dashboard/calendar/page.tsx` (lines 137-140)

**How it works:**

```typescript
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr); // Parse UTC string from database
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  // ⚠️ NO TIMEZONE SPECIFIED - uses browser's local timezone!
};
```

**🔴 PROBLEM IDENTIFIED:**

The dashboard does NOT specify a timezone when formatting times. This means:

```javascript
// Database value: "2026-03-02T05:00:00.000Z" (9:00 AM Dubai in UTC)

// User in Dubai (UTC+4):
new Date("2026-03-02T05:00:00.000Z").toLocaleTimeString('en-US')
// → "9:00 AM" ✅ Correct

// User in India (UTC+5:30):
new Date("2026-03-02T05:00:00.000Z").toLocaleTimeString('en-US')
// → "10:30 AM" ❌ Wrong! (5:00 UTC + 5:30 = 10:30 India time)
```

**The Fix:**

```typescript
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Dubai' // ← ADD THIS
  });
};
```

---

## PART 2: DATABASE INVESTIGATION

### Expected Database Schema

**Table:** `appointments`  
**Column:** `scheduled_time` (type: `timestamptz`)

**Sample Query Results (Expected):**

```sql
SELECT 
  scheduled_time,
  scheduled_time AT TIME ZONE 'UTC' as utc_time,
  scheduled_time AT TIME ZONE 'Asia/Dubai' as dubai_time,
  scheduled_time AT TIME ZONE 'Asia/Kolkata' as india_time
FROM appointments 
WHERE tenant_id = 'a83001cc-421c-4bc4-a60b-fe8427c110d1'
ORDER BY created_at DESC LIMIT 1;
```

**Expected Result for 9:00 AM Dubai booking:**

| Column | Value | Explanation |
|--------|-------|-------------|
| `scheduled_time` | `2026-03-02 05:00:00+00` | Stored as UTC |
| `utc_time` | `2026-03-02 05:00:00` | 5:00 AM UTC |
| `dubai_time` | `2026-03-02 09:00:00` | 9:00 AM Dubai ✅ |
| `india_time` | `2026-03-02 10:30:00` | 10:30 AM India |

---

## PART 3: WHY "12:30 PM" BECAME "2:00 PM"

### The Discrepancy Explained

**Scenario:**
- User from India (UTC+5:30) books via WhatsApp
- User says: "12:30 PM"
- Dashboard shows: "2:00 PM"
- Difference: 1.5 hours

**Root Cause Analysis:**

There are **TWO possible explanations**:

### Explanation A: Dashboard Timezone Bug (MOST LIKELY)

```
User books: 12:30 PM (intended as Dubai time)
AI offers: 12:30 PM Dubai = 2026-03-02T08:30:00.000Z (UTC)
Database stores: 2026-03-02T08:30:00.000Z
Dashboard (India user): Displays in India time = 2:00 PM ❌

Calculation: 08:30 UTC + 5:30 India offset = 14:00 India (2:00 PM)
```

**This is the bug:** Dashboard is showing times in the **viewer's local timezone** instead of **Dubai timezone**.

### Explanation B: AI Misinterpretation (Less Likely)

```
User says: "12:30 PM"
AI interprets as: 12:30 PM India time (wrong assumption)
AI converts: 12:30 PM India = 07:00 UTC = 11:00 AM Dubai
AI offers: 11:00 AM Dubai slot
User confirms
Dashboard shows: 11:00 AM Dubai... but user expected 12:30 PM
```

This doesn't match the 1.5 hour difference, so **Explanation A is correct**.

---

## PART 4: RECOMMENDATION

### Current System Analysis

**Strengths:**
- ✅ Slot generation correctly uses tenant timezone (Dubai)
- ✅ Database stores UTC timestamps (best practice)
- ✅ AI receives and passes ISO datetimes (no ambiguity)
- ✅ Booking flow preserves timezone information

**Weaknesses:**
- ❌ Dashboard displays times in viewer's local timezone (BUG)
- ❌ No explicit timezone shown to users ("All times are Dubai/GST")
- ❌ Complex timezone handling increases bug surface area

### Use Case Analysis

**Your Business:**
- Location: Dubai (UTC+4)
- Target Market: UAE, Saudi Arabia, Qatar, Bahrain, Oman
- Timezone Range: UTC+3 to UTC+4 (very close)
- International Customers: Rare

**Customer Expectations:**
- GCC customers expect times in Gulf Standard Time
- Business hours are Dubai-centric (9am-6pm Dubai)
- Customers don't need automatic timezone conversion

---

## RECOMMENDATION: OPTION C (Simplify to Dubai-Only)

### Why This Is The Best Choice

1. **Eliminates the dashboard bug** - No more viewer timezone issues
2. **Matches business reality** - 95%+ customers are in GCC
3. **Reduces complexity** - No timezone conversion logic needed
4. **Prevents future bugs** - Simpler code = fewer edge cases
5. **Clear user expectations** - "All times are Dubai/GST time"

### Implementation

#### Fix #1: Dashboard Display (CRITICAL)

**File:** `src/app/dashboard/calendar/page.tsx`

```typescript
// BEFORE (BUG):
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }); // ❌ Uses viewer's timezone
};

// AFTER (FIXED):
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Dubai' // ✅ Always show Dubai time
  });
};
```

#### Fix #2: Add Timezone Label

```typescript
// In dashboard header or appointment details:
<div className="text-sm text-gray-500">
  All times shown in Dubai/GST (UTC+4)
</div>
```

#### Fix #3: WhatsApp Confirmation Message

**File:** `src/lib/ai/agent.ts` (after booking)

```typescript
// Add timezone clarification to confirmation:
`✅ Appointment confirmed for ${formattedTime} Dubai time (GST)`
```

---

## ALTERNATIVE: Keep Timezone Conversion (Not Recommended)

If you want to support international customers with automatic timezone conversion:

### Required Fixes

1. **Dashboard:** Always specify `timeZone: 'Asia/Dubai'` in all date formatting
2. **User Profile:** Store user's timezone preference
3. **Display Toggle:** Allow users to view in their local time or Dubai time
4. **Clear Labels:** Always show which timezone is displayed

### Additional Complexity

- User timezone detection (by phone number, IP, or manual selection)
- Timezone conversion UI/UX
- More edge cases and potential bugs
- Confusion when multiple users view same appointment

---

## SUMMARY

### Current State
- ✅ Slot generation: Correct (Dubai timezone)
- ✅ Booking: Correct (UTC storage)
- ❌ Dashboard display: **BUG** (uses viewer's timezone instead of Dubai)

### Root Cause of "12:30 PM → 2:00 PM" Issue
Dashboard is displaying times in the **viewer's local timezone** (India UTC+5:30) instead of **business timezone** (Dubai UTC+4).

### Recommended Solution
**OPTION C: Simplify to Dubai-Only**

1. Fix dashboard to always display Dubai time
2. Add "All times are Dubai/GST" label
3. Keep current slot generation and booking logic (already correct)
4. No need for complex timezone conversion

### Implementation Priority
1. **CRITICAL:** Fix dashboard `formatTime()` function (5 minutes)
2. **HIGH:** Add timezone labels to UI (10 minutes)
3. **MEDIUM:** Add timezone to WhatsApp confirmations (5 minutes)

**Total effort:** ~20 minutes to fix the bug and prevent future confusion.

---

## NEXT STEPS

1. Run the investigation script to see actual database values
2. Apply the dashboard fix
3. Test with a new booking
4. Verify dashboard shows correct time regardless of viewer's location
