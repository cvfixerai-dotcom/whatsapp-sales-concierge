# SalesConcierge AI — Improvement Roadmap

> This document outlines suggested improvements organized into 4 phases.
> Each phase builds on the previous one. No phase will break existing functionality.
> **Approval required before implementation begins.**

---

## Phase 1: Foundation & Polish (Low effort, High impact)

These are quick wins that improve daily usability without touching core logic.

### 1.1 — Logout Button
- **Problem:** There is no way for a logged-in user to sign out.
- **Spec:**
  - Add a "Sign Out" button at the bottom of the sidebar on all dashboard pages.
  - Use `signOut()` from `next-auth/react` with redirect to `/auth/login`.
  - Style: subtle text link at sidebar bottom with a `LogOut` icon.
- **Files:** All 7 dashboard page files (sidebar section), or Phase 2's shared layout.
- **Risk:** None.
- **Estimate:** ~30 minutes.

### 1.2 — Empty States for All Pages
- **Problem:** Calendar, Analytics, Leads, Handoffs, and Conversations show blank content or zeros when a tenant has no data, which looks broken.
- **Spec:**
  - Add a centered empty-state illustration (icon + heading + description + CTA) when data arrays are empty.
  - Examples:
    - **Leads:** "No leads yet — leads will appear here when customers message your WhatsApp number."
    - **Calendar:** "No appointments this month — connect your calendar in Settings to start booking."
    - **Analytics:** "Not enough data yet — analytics will populate after your first conversations."
    - **Handoffs:** "No handoff requests — handoffs appear when the AI detects a customer needs human help."
  - Each empty state includes a relevant action button (e.g., "Go to Settings", "View Docs").
- **Files:** `leads/page.tsx`, `calendar/page.tsx`, `analytics/page.tsx`, `handoffs/page.tsx`.
- **Risk:** None.
- **Estimate:** ~1 hour.

### 1.3 — Toast Notifications (Replace alerts)
- **Problem:** Several pages use `alert()` for success/error messages (handoffs, billing, settings). This blocks the UI.
- **Spec:**
  - Install `react-hot-toast` (lightweight, ~3KB).
  - Add `<Toaster />` to the root layout.
  - Replace all `alert()` calls with `toast.success()` or `toast.error()`.
  - Position: top-right, auto-dismiss after 4 seconds.
- **Files:** `layout.tsx`, `handoffs/page.tsx`, `billing/page.tsx`, `settings/page.tsx`.
- **Risk:** None. Drop-in replacement.
- **Estimate:** ~30 minutes.

---

## Phase 2: Architecture & UX (Medium effort, High impact)

These changes reduce code duplication and add missing functionality.

### 2.1 — Shared Dashboard Layout (Extract Sidebar)
- **Problem:** The sidebar navigation is duplicated across 7 page files. Any nav change requires editing all 7.
- **Spec:**
  - Create `/src/app/dashboard/layout.tsx` as a shared layout component.
  - Move the top nav bar and sidebar into this layout.
  - Use `usePathname()` to highlight the active sidebar link dynamically.
  - Each page file becomes just its main content (no sidebar/nav duplication).
  - Include the logout button from Phase 1.1 in this shared layout.
- **Files:** New `dashboard/layout.tsx`; refactor all 7 dashboard page files.
- **Risk:** Low. Next.js nested layouts are a standard pattern. Requires careful testing of each page after refactor.
- **Estimate:** ~2 hours.

### 2.2 — Conversations Inbox Page
- **Problem:** There is a `/dashboard/conversations/[id]` viewer but no list page. Users can only reach conversations through the leads table.
- **Spec:**
  - Create `/src/app/dashboard/conversations/page.tsx`.
  - Show a list of all conversations sorted by most recent message.
  - Each row: contact name, last message preview (truncated), timestamp, temperature badge, status badge.
  - Click a row to navigate to `/dashboard/conversations/[id]`.
  - Add search/filter by status (active, handoff-requested, closed).
  - Add "Conversations" to the sidebar nav (between Dashboard and Leads).
- **Files:** New `conversations/page.tsx`; update sidebar nav in `dashboard/layout.tsx`.
- **Risk:** None.
- **Estimate:** ~2 hours.

### 2.3 — Mobile-Responsive Sidebar
- **Problem:** The fixed 256px sidebar breaks on mobile devices. Content is cut off or requires horizontal scrolling.
- **Spec:**
  - Make the sidebar collapsible on screens < 768px.
  - Add a hamburger menu icon in the top nav that toggles the sidebar as an overlay.
  - Sidebar slides in from the left with a semi-transparent backdrop.
  - Close on link click or backdrop click.
  - Desktop behavior unchanged.
- **Files:** `dashboard/layout.tsx` (after Phase 2.1).
- **Risk:** Low. CSS + state toggle.
- **Estimate:** ~1.5 hours.

### 2.4 — Loading Skeletons
- **Problem:** Current loading state is a spinning circle on a blank page. This looks unfinished.
- **Spec:**
  - Replace the spinner with content-aware skeleton loaders (shimmer rectangles matching the layout).
  - Dashboard: skeleton KPI cards + skeleton chart areas.
  - Leads: skeleton table rows.
  - Calendar: skeleton appointment cards.
  - Use Tailwind `animate-pulse` on `bg-gray-200` rounded divs.
- **Files:** All dashboard page files (loading state sections).
- **Risk:** None. Visual-only change.
- **Estimate:** ~1.5 hours.

---

## Phase 3: Feature Enhancements (Medium effort, Strategic impact)

These features add real product value and unlock higher pricing tiers.

### 3.1 — AI Prompt Customization in Settings
- **Problem:** AI personality and qualification criteria are set during onboarding but cannot be edited afterwards.
- **Spec:**
  - Add a new "AI Configuration" tab in Settings page.
  - Fields: AI personality/tone (textarea), qualification criteria (textarea), greeting message (input), language preference (dropdown).
  - Save to the `tenants` table (fields already exist: `ai_personality`, `qualification_criteria`, etc.).
  - Add a "Preview" section showing a sample AI greeting based on current config.
- **Files:** `settings/page.tsx`, existing API route `/api/settings`.
- **Risk:** Low. Data layer already exists from onboarding.
- **Estimate:** ~2 hours.

### 3.2 — Webhook Activity Log
- **Problem:** No visibility into message processing, webhook events, or errors. Debugging production issues is blind.
- **Spec:**
  - Create `/src/app/dashboard/activity/page.tsx`.
  - Query `webhook_events` table showing: timestamp, type (inbound/outbound), status (processed/pending/failed), from number, error message if any.
  - Sortable table with pagination (20 per page).
  - Auto-refresh toggle (poll every 10 seconds).
  - Add "Activity Log" to sidebar nav.
- **Files:** New `activity/page.tsx`; update sidebar.
- **Risk:** None. Read-only page querying existing table.
- **Estimate:** ~2 hours.

### 3.3 — Real-Time Dashboard Updates
- **Problem:** Dashboard KPIs only load once. New conversations don't update the numbers until page refresh.
- **Spec:**
  - Add Supabase real-time subscriptions to the dashboard for `conversations`, `contacts`, and `appointments` tables.
  - When a new row is inserted, increment the relevant KPI counter and prepend to the recent activity list.
  - Add a subtle "Live" indicator badge next to the Dashboard title.
- **Files:** `dashboard/page.tsx`.
- **Risk:** Low. Supabase real-time is already used in `handoffs/page.tsx` as a pattern.
- **Estimate:** ~1.5 hours.

### 3.4 — WhatsApp Template Messages
- **Problem:** Proactive outreach (appointment reminders, follow-ups) requires pre-approved WhatsApp template messages.
- **Spec:**
  - Add a "Templates" section in Settings.
  - Allow tenants to configure: appointment reminder template, follow-up template, welcome message template.
  - Store templates in `tenants` table as a JSON column.
  - Use these templates in the appointment reminder worker and follow-up logic.
- **Files:** `settings/page.tsx`, `/api/settings` route, message processor worker.
- **Risk:** Low-Medium. Twilio requires templates to be pre-approved in their console; this UI is for internal configuration.
- **Estimate:** ~2.5 hours.

---

## Phase 4: Growth & Differentiation (Higher effort, Competitive advantage)

These features are what move the product from "useful tool" to "must-have platform."

### 4.1 — Interactive AI Demo on Landing Page
- **Problem:** Prospects can't experience the AI before signing up. This is the #1 conversion blocker for conversational AI products.
- **Spec:**
  - Add a simulated WhatsApp chat widget to the landing page hero section.
  - Pre-scripted conversation flow: visitor types a property inquiry → AI responds with qualification questions → books a demo appointment.
  - 3-5 turns of conversation with typing indicators and message bubbles.
  - "Try it live" CTA that links to signup.
  - No real API calls — purely frontend simulation with delays.
- **Files:** New component `src/components/ChatDemo.tsx`; update `page.tsx` (landing).
- **Risk:** None. No backend changes.
- **Estimate:** ~3 hours.

### 4.2 — Multi-User / Team Roles
- **Problem:** Currently one user per tenant. Growth and Scale plans ($799-$1,499/mo) need team support to justify the price.
- **Spec:**
  - Add a `users` table query in Settings → new "Team" tab.
  - Roles: `admin` (full access), `agent` (can view conversations, manage handoffs), `viewer` (read-only).
  - Admin can invite team members by email (sends signup link with tenant pre-filled).
  - Role-based visibility: hide Settings/Billing for non-admins.
  - Use existing `role` field in the JWT session token.
- **Files:** `settings/page.tsx` (new tab), new `/api/team` routes, `middleware.ts` (role checks).
- **Risk:** Medium. Requires careful auth boundary testing.
- **Estimate:** ~4-5 hours.

### 4.3 — CRM Export / Zapier Webhook
- **Problem:** Scale-tier customers need to sync leads with their existing CRM (HubSpot, Salesforce, etc.).
- **Spec:**
  - Add a "Webhook URL" field in Settings where tenants can paste a Zapier/Make webhook URL.
  - Fire a POST request to this URL whenever: a new lead is created, a lead temperature changes, an appointment is booked, a handoff is triggered.
  - Payload: standard JSON with lead data, event type, and timestamp.
  - This enables Zapier → CRM integration without building native CRM connectors.
- **Files:** `settings/page.tsx`, new service `src/lib/services/webhook-notifier.ts`, AI agent and handoff service.
- **Risk:** Low. Outbound HTTP POST on events.
- **Estimate:** ~3 hours.

---

## Summary Table

| #   | Improvement                    | Phase | Effort    | Impact     |
|-----|--------------------------------|-------|-----------|------------|
| 1.1 | Logout button                  | 1     | 30 min    | High       |
| 1.2 | Empty states                   | 1     | 1 hr      | High       |
| 1.3 | Toast notifications            | 1     | 30 min    | Medium     |
| 2.1 | Shared dashboard layout        | 2     | 2 hrs     | High       |
| 2.2 | Conversations inbox            | 2     | 2 hrs     | High       |
| 2.3 | Mobile-responsive sidebar      | 2     | 1.5 hrs   | High       |
| 2.4 | Loading skeletons              | 2     | 1.5 hrs   | Medium     |
| 3.1 | AI prompt customization        | 3     | 2 hrs     | High       |
| 3.2 | Webhook activity log           | 3     | 2 hrs     | Medium     |
| 3.3 | Real-time dashboard            | 3     | 1.5 hrs   | Medium     |
| 3.4 | WhatsApp templates             | 3     | 2.5 hrs   | High       |
| 4.1 | Interactive AI demo            | 4     | 3 hrs     | Very High  |
| 4.2 | Multi-user / team roles        | 4     | 4-5 hrs   | Very High  |
| 4.3 | CRM export / Zapier webhook    | 4     | 3 hrs     | High       |

**Total estimated effort:** ~25-27 hours across all 4 phases.

---

## How to Proceed

1. Review each phase and item above.
2. Approve the phases you want implemented (e.g., "Approve Phase 1 and 2").
3. Flag any items you want to skip, modify, or reprioritize.
4. Implementation begins on approval — each phase is committed and deployed independently.
