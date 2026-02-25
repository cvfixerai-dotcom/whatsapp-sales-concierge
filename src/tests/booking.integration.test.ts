// @ts-nocheck
/**
 * Deterministic Integration Test — Booking Engine
 *
 * Tests the full booking pipeline without any AI involvement:
 *   checkCalendar → bookAppointment → DB verify → formatBookingConfirmation
 *
 * Run with:
 *   npx tsx src/tests/booking.integration.test.ts
 */

import 'dotenv/config';
import { checkCalendar } from '../lib/ai/tools/check-calendar';
import { bookAppointment } from '../lib/ai/tools/book-appointment';
import { formatBookingConfirmation } from '../lib/ai/booking-confirmation';
import { supabaseAdmin } from '../lib/db/client';

// ─── Constants ───────────────────────────────────────────────────────────────

// Fixed UUID reserved for integration tests — never used in production
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_TIMEZONE = 'Asia/Dubai';
const TEST_CONTACT_WHATSAPP = '+971000000000';
const TEST_CONTACT_NAME = 'Integration Test User';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(stage: string, msg: string): void {
  console.log(`\n[${stage}] ${msg}`);
}

function logObject(stage: string, label: string, obj: any): void {
  console.log(`\n[${stage}] ${label}:`);
  console.log(JSON.stringify(obj, null, 2));
}

function fail(stage: string, msg: string, detail?: any): never {
  console.error(`\n[${stage}] FAILED: ${msg}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function setupTenant(): Promise<{ tenantId: string; isNew: boolean }> {
  log('SETUP', `Checking for existing tenant id="${TEST_TENANT_ID}"`);

  const { data: existing } = await supabaseAdmin
    .from('tenants')
    .select('id, company_name, timezone')
    .eq('id', TEST_TENANT_ID)
    .maybeSingle();

  if (existing) {
    log('SETUP', `Using existing tenant: ${existing.company_name} (${existing.id})`);
    return { tenantId: existing.id, isNew: false };
  }

  log('SETUP', 'No existing tenant found. Creating test tenant...');

  const { data: newTenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .insert({
      id: TEST_TENANT_ID,
      company_name: 'Integration Test Co',
      timezone: TEST_TIMEZONE,
      subscription_status: 'active',
      subscription_tier: 'growth',
      ai_provider: 'anthropic',
      ai_model: 'claude-3-5-sonnet-20241022',
    })
    .select()
    .single();

  if (tenantErr || !newTenant) {
    fail('SETUP', 'Failed to create test tenant', tenantErr);
  }

  log('SETUP', `Created test tenant: ${newTenant.id}`);

  // Insert availability settings so getAvailableSlots has data to work with
  const { error: availErr } = await supabaseAdmin
    .from('availability_settings')
    .insert({
      tenant_id: TEST_TENANT_ID,
      monday_start: '09:00', monday_end: '17:00', monday_enabled: true,
      tuesday_start: '09:00', tuesday_end: '17:00', tuesday_enabled: true,
      wednesday_start: '09:00', wednesday_end: '17:00', wednesday_enabled: true,
      thursday_start: '09:00', thursday_end: '17:00', thursday_enabled: true,
      friday_start: '09:00', friday_end: '17:00', friday_enabled: true,
      saturday_start: '09:00', saturday_end: '13:00', saturday_enabled: false,
      sunday_start: '09:00', sunday_end: '13:00', sunday_enabled: false,
      slot_duration: 30,
      buffer_time: 0,
      max_per_day: 20,
      booking_window_days: 30,
      min_notice_hours: 2,
      timezone: TEST_TIMEZONE,
    });

  if (availErr) {
    log('SETUP', `Warning: could not insert availability_settings (may already exist): ${availErr.message}`);
  } else {
    log('SETUP', 'Inserted availability settings for test tenant.');
  }

  return { tenantId: newTenant.id, isNew: true };
}

async function setupContact(tenantId: string): Promise<string> {
  log('SETUP', `Creating test contact for tenant ${tenantId}...`);

  // Clean up any pre-existing test contact with this number to ensure a fresh run
  await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', TEST_CONTACT_WHATSAPP);

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      name: TEST_CONTACT_NAME,
      whatsapp_number: TEST_CONTACT_WHATSAPP,
      temperature: 'new',
      lead_score: 0,
      qualification_status: 'unqualified',
      metadata: {},
    })
    .select('id')
    .single();

  if (contactErr || !contact) {
    fail('SETUP', 'Failed to create test contact', contactErr);
  }

  log('SETUP', `Created test contact: id=${contact.id}`);
  return contact.id;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup(tenantId: string, contactId: string, isNewTenant: boolean): Promise<void> {
  log('CLEANUP', 'Starting cleanup...');

  const { error: apptErr } = await supabaseAdmin
    .from('appointments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId);

  if (apptErr) {
    console.warn(`[CLEANUP] Warning: could not delete appointments: ${apptErr.message}`);
  } else {
    log('CLEANUP', 'Deleted test appointments.');
  }

  const { error: contactErr } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('id', contactId);

  if (contactErr) {
    console.warn(`[CLEANUP] Warning: could not delete test contact: ${contactErr.message}`);
  } else {
    log('CLEANUP', 'Deleted test contact.');
  }

  if (isNewTenant) {
    await supabaseAdmin
      .from('availability_settings')
      .delete()
      .eq('tenant_id', tenantId);

    const { error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (tenantErr) {
      console.warn(`[CLEANUP] Warning: could not delete test tenant: ${tenantErr.message}`);
    } else {
      log('CLEANUP', 'Deleted test tenant.');
    }
  }

  log('CLEANUP', 'Cleanup complete.');
}

// ─── Main Test ───────────────────────────────────────────────────────────────

async function runTest(): Promise<void> {
  console.log('\n========================================');
  console.log('  BOOKING ENGINE INTEGRATION TEST');
  console.log('========================================');

  let tenantId = '';
  let contactId = '';
  let isNewTenant = false;

  try {
    // ── Stage 1: Setup ──────────────────────────────────────────────────────
    const tenantSetup = await setupTenant();
    tenantId = tenantSetup.tenantId;
    isNewTenant = tenantSetup.isNew;

    contactId = await setupContact(tenantId);

    // ── Stage 2: checkCalendar ──────────────────────────────────────────────
    log('CHECK_CALENDAR', `Calling checkCalendar for tenantId=${tenantId} contactId=${contactId}`);

    const calendarResult = await checkCalendar({ tenantId, contactId });

    if (!calendarResult.success) {
      fail('CHECK_CALENDAR', 'checkCalendar returned success=false', calendarResult);
    }

    if (!calendarResult.available_slots || calendarResult.available_slots.length === 0) {
      fail(
        'CHECK_CALENDAR',
        'No available slots returned. Check that availability_settings exists and has enabled days with future hours.',
        calendarResult
      );
    }

    log('CHECK_CALENDAR', `Returned ${calendarResult.available_slots.length} available slots.`);
    log('CHECK_CALENDAR', 'First 3 slots:');
    calendarResult.available_slots.slice(0, 3).forEach((slot, i) => {
      console.log(`  [${i + 1}] datetime: ${slot.datetime}  |  formatted: ${slot.formatted}`);
    });

    // ── Stage 3: Verify slot stored in contact metadata ────────────────────
    log('METADATA', `Verifying calendar_last_slots stored in contacts.metadata for contactId=${contactId}`);

    const { data: updatedContact, error: metaErr } = await supabaseAdmin
      .from('contacts')
      .select('metadata')
      .eq('id', contactId)
      .single();

    if (metaErr || !updatedContact) {
      fail('METADATA', 'Could not fetch contact after checkCalendar', metaErr);
    }

    const lastSlots = updatedContact.metadata?.calendar_last_slots;
    if (!Array.isArray(lastSlots) || lastSlots.length === 0) {
      fail(
        'METADATA',
        'calendar_last_slots was not stored in contact metadata after checkCalendar.',
        updatedContact.metadata
      );
    }

    log('METADATA', `calendar_last_slots correctly stored: ${lastSlots.length} entries.`);

    // ── Stage 4: bookAppointment ────────────────────────────────────────────
    const firstSlot = calendarResult.available_slots[0];
    log('BOOK_APPOINTMENT', `Booking first slot: datetime=${firstSlot.datetime} (${firstSlot.formatted})`);

    const bookingResult = await bookAppointment({
      tenantId,
      contactId,
      conversationId: '',
      slotTime: firstSlot.datetime,
    });

    logObject('BOOK_APPOINTMENT', 'bookAppointment result', bookingResult);

    if (!bookingResult.success) {
      fail('BOOK_APPOINTMENT', `bookAppointment returned success=false: ${bookingResult.error}`);
    }

    if (!bookingResult.confirmed_iso) {
      fail(
        'BOOK_APPOINTMENT',
        'bookAppointment succeeded but confirmed_iso is missing from result.',
        bookingResult
      );
    }

    log('BOOK_APPOINTMENT', `Booking confirmed. confirmed_iso=${bookingResult.confirmed_iso}`);

    // ── Stage 5: Verify DB insert ───────────────────────────────────────────
    log('DB_VERIFY', `Querying appointments table for tenantId=${tenantId} contactId=${contactId}`);

    const { data: appointment, error: dbErr } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (dbErr || !appointment) {
      fail('DB_VERIFY', 'No appointment row found in DB after booking.', dbErr);
    }

    logObject('DB_VERIFY', 'Appointment row from DB', {
      id: appointment.id,
      tenant_id: appointment.tenant_id,
      contact_id: appointment.contact_id,
      scheduled_time: appointment.scheduled_time,
      status: appointment.status,
      calendar_provider: appointment.calendar_provider,
    });

    // Verify scheduled_time matches what was booked
    const dbMs = new Date(appointment.scheduled_time).getTime();
    const expectedMs = new Date(firstSlot.datetime).getTime();

    if (dbMs !== expectedMs) {
      fail(
        'DB_VERIFY',
        `scheduled_time mismatch. DB has "${appointment.scheduled_time}", expected "${firstSlot.datetime}".`
      );
    }

    log('DB_VERIFY', `scheduled_time matches expected ISO. PASS ✓`);

    if (appointment.status !== 'scheduled') {
      fail('DB_VERIFY', `Expected status="scheduled", got "${appointment.status}".`);
    }

    log('DB_VERIFY', `status="scheduled". PASS ✓`);

    // ── Stage 6: Format confirmation ────────────────────────────────────────
    log('FORMAT_CONFIRMATION', `Calling formatBookingConfirmation for ISO=${appointment.scheduled_time} tz=${TEST_TIMEZONE}`);

    let confirmationMessage: string;
    try {
      confirmationMessage = formatBookingConfirmation(
        appointment.scheduled_time,
        TEST_TIMEZONE,
        'en'
      );
    } catch (fmtErr) {
      fail('FORMAT_CONFIRMATION', 'formatBookingConfirmation threw an error.', fmtErr);
    }

    log('FORMAT_CONFIRMATION', `Confirmation message: "${confirmationMessage}"`);

    if (!confirmationMessage || confirmationMessage.trim().length === 0) {
      fail('FORMAT_CONFIRMATION', 'formatBookingConfirmation returned an empty string.');
    }

    if (!confirmationMessage.includes('booked for')) {
      fail(
        'FORMAT_CONFIRMATION',
        `Confirmation message does not contain expected text "booked for". Got: "${confirmationMessage}"`
      );
    }

    log('FORMAT_CONFIRMATION', 'Confirmation message valid. PASS ✓');

    // ── Stage 7: Cleanup ────────────────────────────────────────────────────
    await cleanup(tenantId, contactId, isNewTenant);

    // ── Done ────────────────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('  BOOKING INTEGRATION TEST PASSED ✓');
    console.log('========================================\n');

  } catch (err: any) {
    console.error('\n[FATAL] Unhandled error during test:');
    console.error(err?.message || err);
    if (err?.stack) console.error(err.stack);

    // Best-effort cleanup on failure
    if (tenantId && contactId) {
      try {
        await cleanup(tenantId, contactId, isNewTenant);
      } catch (cleanupErr) {
        console.warn('[FATAL] Cleanup also failed:', cleanupErr);
      }
    }

    process.exit(1);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

runTest();
