/**
 * Clear Test Data Script
 * =======================
 * Clears conversations, messages, appointments, and optionally contacts
 * so you can start testing from scratch.
 *
 * Usage:
 *   npx tsx scripts/clear-test-data.ts          # Clear conversations + messages + appointments
 *   npx tsx scripts/clear-test-data.ts --all     # Also clear contacts and availability settings
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const clearAll = process.argv.includes('--all');

async function clearData() {
  console.log('\n🧹 Clearing test data...\n');

  // 1. Delete messages (depends on conversations)
  const { count: msgCount, error: msgErr } = await supabase
    .from('messages')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
  console.log(`  Messages:      ${msgErr ? '❌ ' + msgErr.message : `✅ deleted ${msgCount || 0}`}`);

  // 2. Delete appointments
  const { count: aptCount, error: aptErr } = await supabase
    .from('appointments')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log(`  Appointments:  ${aptErr ? '❌ ' + aptErr.message : `✅ deleted ${aptCount || 0}`}`);

  // 3. Delete webhook events
  const { count: whCount, error: whErr } = await supabase
    .from('webhook_events')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log(`  Webhook events: ${whErr ? '❌ ' + whErr.message : `✅ deleted ${whCount || 0}`}`);

  // 4. Delete conversations
  const { count: convCount, error: convErr } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log(`  Conversations: ${convErr ? '❌ ' + convErr.message : `✅ deleted ${convCount || 0}`}`);

  // 5. Delete blocked slots
  const { count: blockCount, error: blockErr } = await supabase
    .from('blocked_slots')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log(`  Blocked slots: ${blockErr ? '❌ ' + blockErr.message : `✅ deleted ${blockCount || 0}`}`);

  if (clearAll) {
    // 6. Delete contacts
    const { count: contactCount, error: contactErr } = await supabase
      .from('contacts')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(`  Contacts:      ${contactErr ? '❌ ' + contactErr.message : `✅ deleted ${contactCount || 0}`}`);

    // 7. Delete availability settings
    const { count: availCount, error: availErr } = await supabase
      .from('availability_settings')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(`  Availability:  ${availErr ? '❌ ' + availErr.message : `✅ deleted ${availCount || 0}`}`);
  }

  console.log(`\n✅ Done! ${clearAll ? 'All data cleared.' : 'Conversations cleared. Contacts kept.'}`);
  console.log('   You can now test with a fresh WhatsApp message.\n');
}

clearData().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
