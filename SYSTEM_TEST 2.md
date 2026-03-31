# System Test Plan — WhatsApp Sales Concierge

**Updated:** February 14, 2026 | **Demo:** Demo Miracle | **WhatsApp:** +1 409 908 3940 | **Email:** lordskempo@yahoo.com

---

## 1. SQLs to Run (In Order in Supabase SQL Editor)

### SQL 1: Enhanced System Migration
**File:** `supabase/migrations/20240210_enhanced_system.sql`
- Adds tenant columns: ai_assistant_name, agent_display_name, trial dates
- Creates tables: follow_up_sequences, scheduled_followups, appointment_reminders

### SQL 2: Seed Demo Tenant
**File:** `scripts/seed-demo-tenant.sql`
- Creates "Demo Miracle" tenant with WhatsApp +14099083940
- After running, execute these manually:

```sql
-- Get tenant ID
SELECT id FROM tenants WHERE twilio_whatsapp_number = '+14099083940';

-- Create owner user (replace <TENANT_ID>)
INSERT INTO users (tenant_id, email, password_hash, role, full_name, is_active)
VALUES ('<TENANT_ID>', 'lordskempo@yahoo.com',
  '$2a$10$rOzBqBHwDGvMlP8GpCsQ4OQfMCiiMbwP3BXVkO2ZPBqGBv5v1J3lW',
  'owner', 'Demo Miracle', true);

-- Set Twilio credentials (replace with real values)
UPDATE tenants SET
  twilio_account_sid = 'YOUR_TWILIO_SID',
  twilio_auth_token = 'YOUR_TWILIO_TOKEN'
WHERE twilio_whatsapp_number = '+14099083940';
```

### SQL 3: Previous Migrations (only if not already run)
- `20240207_add_onboarding.sql`
- `20240207_add_handoff_system.sql`
- `20240207_add_google_calendar.sql`
- `20240207_add_performance_indexes.sql`
- `20240208_add_whatsapp_templates.sql`
- `20240209_add_webhook_url.sql`
- `20240210_add_inapp_calendar.sql`
- `20240207_update_fixerai_config.sql`

---

## 2. Test Checklist

### A. Dashboard Login
- [ ] Go to `/auth/login`, login with lordskempo@yahoo.com / password123
- [ ] Verify dashboard loads with stats
- [ ] Check leads page shows empty (fresh start)

### B. WhatsApp Webhook (Core Flow)
- [ ] `GET /api/webhook/twilio` — returns health check with Demo Miracle tenant
- [ ] Send WhatsApp message to +14099083940
- [ ] Verify AI responds within 10 seconds
- [ ] Check new contact created in Supabase `contacts` table
- [ ] Check new conversation created in `conversations` table
- [ ] Check messages saved in `messages` table (inbound + outbound)
- [ ] Verify AI introduces itself as "Sarah"

### C. Lead Qualification
- [ ] Send: "I'm looking for a 2-bedroom apartment in Dubai Marina"
- [ ] AI should ask qualifying questions (budget, timeline, preferences)
- [ ] Send budget: "Around 2 million AED"
- [ ] Send timeline: "Within the next month"
- [ ] Verify lead temperature updated (check contacts table)
- [ ] Verify lead score increased

### D. Appointment Booking
- [ ] Tell AI: "I'd like to schedule a viewing"
- [ ] AI should offer time slots
- [ ] Confirm a time
- [ ] Verify appointment created in `appointments` table
- [ ] AI should mention "Demo Miracle Agent" by name

### E. Follow-up Sequences
- [ ] Check `follow_up_sequences` table has warm + cold templates
- [ ] When lead marked warm → check `scheduled_followups` has 3 entries (day 3, 7, 21)
- [ ] When lead marked hot → check pending followups cancelled

### F. Trial & Rate Limiting
- [ ] Check tenant subscription_status and limits
- [ ] Verify usage count in webhook logs (GET /api/webhook/twilio shows usage)

### G. CRON Endpoints
- [ ] `POST /api/followups/process` with Authorization: Bearer CRON_SECRET
- [ ] `POST /api/reminders/process` with Authorization: Bearer CRON_SECRET
- [ ] Both should return JSON with counts

### H. Templates API
- [ ] `GET /api/followups/templates` (with auth session) — returns sequences
- [ ] `PUT /api/followups/templates` — update a message template

### I. Real Estate Demo Page
- [ ] Visit `/realestate` — verify page loads
- [ ] Check "Demo Miracle" in chat preview
- [ ] Check WhatsApp link points to +14099083940
- [ ] Check pricing: Free/$0, Starter/$197, Growth/$497, Scale/$997
- [ ] Check "Before vs After" section visible
- [ ] Check discovery call form submits

### J. Onboarding Flow
- [ ] Visit `/onboarding` (when logged in)
- [ ] Complete step 0 (business profile) — should auto-set industry
- [ ] Verify follow-up sequences auto-created

---

## 3. How to Clear Conversations & Start Fresh

### Clear a Single Contact's Conversations
```sql
-- Find contact
SELECT id, name, whatsapp_number FROM contacts
WHERE tenant_id = '<TENANT_ID>' ORDER BY created_at DESC;

-- Delete messages for a contact's conversations
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE contact_id = '<CONTACT_ID>'
);

-- Delete conversations
DELETE FROM conversations WHERE contact_id = '<CONTACT_ID>';

-- Optionally delete the contact too
DELETE FROM contacts WHERE id = '<CONTACT_ID>';
```

### Clear ALL Conversations for Demo Tenant
```sql
-- Get demo tenant ID first
SELECT id FROM tenants WHERE twilio_whatsapp_number = '+14099083940';

-- Delete in order (foreign key constraints)
DELETE FROM scheduled_followups WHERE tenant_id = '<TENANT_ID>';
DELETE FROM appointment_reminders WHERE tenant_id IN (
  SELECT ar.tenant_id FROM appointment_reminders ar
  JOIN appointments a ON ar.appointment_id = a.id
  WHERE a.tenant_id = '<TENANT_ID>'
);
DELETE FROM messages WHERE tenant_id = '<TENANT_ID>';
DELETE FROM webhook_events WHERE tenant_id = '<TENANT_ID>';
DELETE FROM conversations WHERE tenant_id = '<TENANT_ID>';
DELETE FROM contacts WHERE tenant_id = '<TENANT_ID>';
```

### Quick One-Liner (Nuclear Option — clears everything for demo tenant)
```sql
DO $$
DECLARE tid UUID;
BEGIN
  SELECT id INTO tid FROM tenants WHERE twilio_whatsapp_number = '+14099083940';
  DELETE FROM scheduled_followups WHERE tenant_id = tid;
  DELETE FROM messages WHERE tenant_id = tid;
  DELETE FROM webhook_events WHERE tenant_id = tid;
  DELETE FROM conversations WHERE tenant_id = tid;
  DELETE FROM contacts WHERE tenant_id = tid;
  RAISE NOTICE 'Cleared all data for tenant %', tid;
END $$;
```

### From the Dashboard
You can also use the API endpoint:
```bash
curl -X POST https://your-domain.com/api/conversations/reset \
  -H "Cookie: your-session-cookie"
```

---

## 4. Environment Variables Required

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=
CRON_SECRET=your-cron-secret
```

---

## 5. API Route Summary

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/webhook/twilio` | POST/GET | None (Twilio) | Inbound WhatsApp messages + health |
| `/api/followups/process` | POST | CRON_SECRET | Send pending follow-ups |
| `/api/followups/templates` | GET/PUT | Session | View/edit follow-up templates |
| `/api/reminders/process` | POST | CRON_SECRET | Send appointment reminders |
| `/api/conversations` | GET | Session | List conversations |
| `/api/conversations/[id]` | GET | Session | Get conversation details |
| `/api/conversations/reply` | POST | Session | Send manual reply |
| `/api/conversations/reset` | POST | Session | Reset conversations |
| `/api/leads` | GET | Session | List leads |
| `/api/dashboard/stats` | GET | Session | Dashboard statistics |
| `/api/onboarding` | GET/POST | Session | Onboarding flow |
| `/api/settings/*` | GET/PUT | Session | Settings (AI, calendar, handoff) |
| `/api/billing/*` | GET/POST | Session | Usage, subscribe, topup |
| `/api/handoffs/*` | GET/POST | Session | Handoff management |
