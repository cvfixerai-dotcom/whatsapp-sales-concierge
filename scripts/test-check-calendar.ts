// @ts-nocheck
/**
 * Test Script: Manually test check_calendar tool
 * This script directly calls check_calendar to see what slots it generates
 */
import { createClient } from '@supabase/supabase-js';
import { checkCalendar } from '../src/lib/ai/tools/check-calendar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testCheckCalendar() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CHECK_CALENDAR TOOL TEST                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, company_name, timezone')
    .eq('company_name', 'Dubai Elite Properties')
    .single();

  if (!tenant) {
    console.error('❌ Tenant not found');
    return;
  }

  console.log('Tenant:', tenant.company_name);
  console.log('Tenant ID:', tenant.id);
  console.log('Timezone:', tenant.timezone || 'NOT SET');

  // Get a contact to test with
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('tenant_id', tenant.id)
    .limit(1)
    .single();

  if (!contact) {
    console.error('❌ No contacts found');
    return;
  }

  console.log('Test Contact:', contact.name || 'Unknown');
  console.log('Contact ID:', contact.id);

  // Get current date/time in Dubai
  const now = new Date();
  const dubaiTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);
  
  console.log('\nCurrent time in Dubai:', dubaiTime);
  console.log('Current time UTC:', now.toISOString());

  // Test 1: Check calendar for tomorrow
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Check calendar for TOMORROW');
  console.log('='.repeat(70));

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  console.log('Requesting slots for:', tomorrowStr);

  const result1 = await checkCalendar({
    tenantId: tenant.id,
    contactId: contact.id,
    preferredDate: tomorrowStr,
    daysAhead: 1,
  });

  console.log('\nResult:', result1.success ? '✅ SUCCESS' : '❌ FAILED');
  if (result1.error) {
    console.error('Error:', result1.error);
  }
  if (result1.available_slots) {
    console.log(`\nTotal slots returned: ${result1.available_slots.length}`);
    console.log('\nAll slots:');
    result1.available_slots.forEach((slot, idx) => {
      console.log(`  ${idx + 1}. ${slot.formatted}`);
      console.log(`     datetime: ${slot.datetime}`);
      console.log(`     dayName: ${slot.dayName}`);
      console.log(`     dateOnly: ${slot.dateOnly}`);
    });
  }

  // Test 2: Check calendar for next 7 days (no preferred date)
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Check calendar for NEXT 7 DAYS (no preferred date)');
  console.log('='.repeat(70));

  const result2 = await checkCalendar({
    tenantId: tenant.id,
    contactId: contact.id,
    daysAhead: 7,
  });

  console.log('\nResult:', result2.success ? '✅ SUCCESS' : '❌ FAILED');
  if (result2.error) {
    console.error('Error:', result2.error);
  }
  if (result2.available_slots) {
    console.log(`\nTotal slots returned: ${result2.available_slots.length}`);
    
    // Group by day
    const slotsByDay = result2.available_slots.reduce((acc, slot) => {
      const day = slot.dayName + ', ' + slot.dateOnly;
      if (!acc[day]) acc[day] = [];
      acc[day].push(slot);
      return acc;
    }, {});

    console.log('\nSlots by day:');
    Object.entries(slotsByDay).forEach(([day, slots]) => {
      console.log(`\n  ${day}: ${slots.length} slots`);
      slots.slice(0, 5).forEach(slot => {
        const time = slot.formatted.split(' at ')[1];
        console.log(`    - ${time}`);
      });
      if (slots.length > 5) {
        console.log(`    ... and ${slots.length - 5} more`);
      }
    });
  }

  // Test 3: Check for specific date - Tuesday, March 3, 2026
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: Check calendar for TUESDAY, MARCH 3, 2026');
  console.log('='.repeat(70));

  const result3 = await checkCalendar({
    tenantId: tenant.id,
    contactId: contact.id,
    preferredDate: '2026-03-03',
    daysAhead: 1,
  });

  console.log('\nResult:', result3.success ? '✅ SUCCESS' : '❌ FAILED');
  if (result3.error) {
    console.error('Error:', result3.error);
  }
  if (result3.available_slots) {
    console.log(`\nTotal slots returned: ${result3.available_slots.length}`);
    console.log('\nAll slots for March 3:');
    result3.available_slots.forEach((slot, idx) => {
      const time = slot.formatted.split(' at ')[1];
      console.log(`  ${idx + 1}. ${time} (${slot.datetime})`);
    });
  }

  // Check existing appointments for March 3
  console.log('\n' + '='.repeat(70));
  console.log('CHECKING EXISTING APPOINTMENTS FOR MARCH 3, 2026');
  console.log('='.repeat(70));

  const { data: appointments } = await supabase
    .from('appointments')
    .select('scheduled_time, duration_minutes, status, customer_name')
    .eq('tenant_id', tenant.id)
    .gte('scheduled_time', '2026-03-03T00:00:00Z')
    .lt('scheduled_time', '2026-03-04T00:00:00Z')
    .order('scheduled_time', { ascending: true });

  if (appointments && appointments.length > 0) {
    console.log(`\n⚠️ Found ${appointments.length} existing appointments on March 3:`);
    appointments.forEach((apt, idx) => {
      const dubaiTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dubai',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(apt.scheduled_time));
      console.log(`  ${idx + 1}. ${dubaiTime} - ${apt.customer_name} (${apt.status}) - ${apt.duration_minutes} min`);
      console.log(`     UTC: ${apt.scheduled_time}`);
    });
  } else {
    console.log('\n✅ No existing appointments on March 3');
  }

  // Check availability settings
  console.log('\n' + '='.repeat(70));
  console.log('AVAILABILITY SETTINGS');
  console.log('='.repeat(70));

  const { data: availability } = await supabase
    .from('availability_settings')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single();

  if (availability) {
    console.log('\nTimezone:', availability.timezone);
    console.log('Slot Duration:', availability.slot_duration, 'minutes');
    console.log('Buffer Time:', availability.buffer_time, 'minutes');
    console.log('Min Notice Hours:', availability.min_notice_hours);
    console.log('Booking Window Days:', availability.booking_window_days);
    console.log('Max Per Day:', availability.max_per_day);

    console.log('\nBusiness Hours:');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const enabled = availability[`${day}_enabled`];
      const start = availability[`${day}_start`];
      const end = availability[`${day}_end`];
      const status = enabled ? `✅ ${start} - ${end}` : '❌ CLOSED';
      console.log(`  ${day.charAt(0).toUpperCase() + day.slice(1)}: ${status}`);
    });
  } else {
    console.log('\n❌ No availability settings found');
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST COMPLETE                                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

testCheckCalendar().catch(console.error);
