// Simple test script for check_calendar investigation
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigate() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CHECK_CALENDAR INVESTIGATION                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Get tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, company_name, timezone, industry')
      .eq('company_name', 'Dubai Elite Properties')
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Tenant not found:', tenantError);
      return;
    }

    console.log('📋 TENANT CONFIGURATION');
    console.log('Company:', tenant.company_name);
    console.log('Tenant ID:', tenant.id);
    console.log('Timezone:', tenant.timezone || 'NOT SET (will default to Asia/Dubai)');
    console.log('Industry:', tenant.industry);

    // Get availability settings
    const { data: availability, error: availError } = await supabase
      .from('availability_settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single();

    console.log('\n📅 AVAILABILITY SETTINGS');
    if (availError || !availability) {
      console.log('❌ No availability settings found - using defaults');
      console.log('   Default: 9am-5pm Mon-Fri, 30min slots, 2hr notice');
    } else {
      console.log('Timezone:', availability.timezone);
      console.log('Slot Duration:', availability.slot_duration, 'minutes');
      console.log('Buffer Time:', availability.buffer_time, 'minutes');
      console.log('Min Notice Hours:', availability.min_notice_hours, 'hours');
      console.log('Booking Window:', availability.booking_window_days, 'days');
      console.log('Max Per Day:', availability.max_per_day, 'appointments');

      console.log('\n📆 BUSINESS HOURS:');
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      days.forEach(day => {
        const enabled = availability[`${day}_enabled`];
        const start = availability[`${day}_start`];
        const end = availability[`${day}_end`];
        const dayName = day.charAt(0).toUpperCase() + day.slice(1);
        if (enabled) {
          console.log(`  ${dayName}: ✅ ${start} - ${end}`);
        } else {
          console.log(`  ${dayName}: ❌ CLOSED`);
        }
      });
    }

    // Current time in Dubai
    const now = new Date();
    const dubaiTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(now);
    
    console.log('\n⏰ CURRENT TIME');
    console.log('Dubai:', dubaiTime);
    console.log('UTC:', now.toISOString());

    // Check appointments for next few days
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 7);

    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select('scheduled_time, duration_minutes, status, customer_name, created_at')
      .eq('tenant_id', tenant.id)
      .gte('scheduled_time', tomorrow.toISOString())
      .lt('scheduled_time', endDate.toISOString())
      .order('scheduled_time', { ascending: true });

    console.log('\n📅 EXISTING APPOINTMENTS (Next 7 days)');
    if (aptError) {
      console.error('Error fetching appointments:', aptError);
    } else if (!appointments || appointments.length === 0) {
      console.log('✅ No appointments found - all slots should be available');
    } else {
      console.log(`⚠️ Found ${appointments.length} existing appointments:`);
      appointments.forEach((apt, idx) => {
        const aptDate = new Date(apt.scheduled_time);
        const dubaiTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dubai',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(aptDate);
        console.log(`  ${idx + 1}. ${dubaiTime} - ${apt.customer_name || 'Unknown'} (${apt.status})`);
        console.log(`     Duration: ${apt.duration_minutes} min | UTC: ${apt.scheduled_time}`);
      });
    }

    // Check blocked slots
    const { data: blocked, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('start_time, end_time, reason')
      .eq('tenant_id', tenant.id)
      .gte('start_time', tomorrow.toISOString())
      .lt('start_time', endDate.toISOString());

    console.log('\n🚫 BLOCKED SLOTS (Next 7 days)');
    if (blockedError) {
      console.error('Error fetching blocked slots:', blockedError);
    } else if (!blocked || blocked.length === 0) {
      console.log('✅ No blocked slots');
    } else {
      console.log(`⚠️ Found ${blocked.length} blocked time ranges:`);
      blocked.forEach((block, idx) => {
        const startDate = new Date(block.start_time);
        const endDate = new Date(block.end_time);
        const startDubai = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dubai',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(startDate);
        const endDubai = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dubai',
          timeStyle: 'short',
        }).format(endDate);
        console.log(`  ${idx + 1}. ${startDubai} - ${endDubai}`);
        console.log(`     Reason: ${block.reason || 'Not specified'}`);
      });
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  INVESTIGATION COMPLETE                                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('💡 NEXT STEPS:');
    console.log('1. Check the logs above for:');
    console.log('   - Are business hours correct? (Should be 9am-6pm)');
    console.log('   - Is min_notice_hours too high? (Should be 2 hours max)');
    console.log('   - Are there appointments blocking morning slots?');
    console.log('   - Are there blocked time ranges?');
    console.log('2. If min_notice_hours is high (e.g., 24), that would block all of tomorrow');
    console.log('3. If current time is after 7am Dubai time, and min_notice is 2 hours,');
    console.log('   then 9am slot would be blocked (too soon)');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

investigate();
