#!/usr/bin/env tsx
/**
 * Timezone Investigation Script
 * Queries database to understand timezone handling
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate() {
  console.log('\n=== TIMEZONE INVESTIGATION ===\n');

  // 1. Check tenant timezone setting
  console.log('1. TENANT TIMEZONE SETTING:');
  console.log('─'.repeat(80));
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, company_name, timezone')
    .eq('company_name', 'Dubai Elite Properties')
    .single();

  if (tenantError) {
    console.error('Error fetching tenant:', tenantError);
  } else {
    console.log('Tenant ID:', tenant.id);
    console.log('Company:', tenant.company_name);
    console.log('Timezone:', tenant.timezone);
    console.log('');

    // 2. Check actual stored appointment values
    console.log('2. RECENT APPOINTMENTS (Raw Database Values):');
    console.log('─'.repeat(80));
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select('id, scheduled_time, created_at, status, contact_id')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (aptError) {
      console.error('Error fetching appointments:', aptError);
    } else {
      appointments.forEach((apt, idx) => {
        console.log(`\nAppointment ${idx + 1}:`);
        console.log('  ID:', apt.id);
        console.log('  Status:', apt.status);
        console.log('  Raw scheduled_time:', apt.scheduled_time);
        console.log('  Type:', typeof apt.scheduled_time);
        
        // Parse and display in different timezones
        const date = new Date(apt.scheduled_time);
        console.log('\n  Interpreted as Date object:', date.toISOString());
        console.log('  UTC:', date.toUTCString());
        console.log('  Dubai (Asia/Dubai):', date.toLocaleString('en-US', {
          timeZone: 'Asia/Dubai',
          dateStyle: 'full',
          timeStyle: 'long'
        }));
        console.log('  India (Asia/Kolkata):', date.toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'full',
          timeStyle: 'long'
        }));
        console.log('  Created at:', apt.created_at);
      });
    }

    // 3. Check current time in different timezones
    console.log('\n\n3. CURRENT TIME IN DIFFERENT TIMEZONES:');
    console.log('─'.repeat(80));
    const now = new Date();
    console.log('Server time (UTC):', now.toISOString());
    console.log('Dubai time:', now.toLocaleString('en-US', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'full',
      timeStyle: 'long'
    }));
    console.log('India time:', now.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'long'
    }));

    // 4. Check availability settings
    console.log('\n\n4. AVAILABILITY SETTINGS:');
    console.log('─'.repeat(80));
    const { data: settings, error: settingsError } = await supabase
      .from('availability_settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    } else {
      console.log('Timezone:', settings.timezone);
      console.log('Monday:', settings.monday_enabled ? `${settings.monday_start} - ${settings.monday_end}` : 'CLOSED');
      console.log('Tuesday:', settings.tuesday_enabled ? `${settings.tuesday_start} - ${settings.tuesday_end}` : 'CLOSED');
      console.log('Min notice hours:', settings.min_notice_hours);
    }
  }

  console.log('\n=== END INVESTIGATION ===\n');
}

investigate().catch(console.error);
