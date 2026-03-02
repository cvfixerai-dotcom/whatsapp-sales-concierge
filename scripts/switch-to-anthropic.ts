#!/usr/bin/env tsx
/**
 * Switch Dubai Elite Properties to use Claude (Anthropic)
 * Reason: Better tool calling reliability (95%+ vs 70-80% with OpenAI)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function switchToAnthropic() {
  console.log('\n🔄 Switching Dubai Elite Properties to Anthropic (Claude)...\n');

  try {
    // Step 1: Update tenant
    console.log('Step 1: Updating tenant configuration...');
    const { data: updateData, error: updateError } = await supabase
      .from('tenants')
      .update({
        ai_provider: 'anthropic',
        ai_model: 'claude-sonnet-4-20250514',
      })
      .eq('company_name', 'Dubai Elite Properties')
      .select();

    if (updateError) {
      console.error('❌ Update failed:', updateError);
      process.exit(1);
    }

    console.log('✅ Tenant updated successfully');
    console.log('Updated records:', updateData?.length || 0);

    // Step 2: Verify the change
    console.log('\nStep 2: Verifying configuration...');
    const { data: tenant, error: verifyError } = await supabase
      .from('tenants')
      .select('id, company_name, ai_provider, ai_model, created_at')
      .eq('company_name', 'Dubai Elite Properties')
      .single();

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
      process.exit(1);
    }

    console.log('\n✅ Configuration verified:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Company:     ${tenant.company_name}`);
    console.log(`Provider:    ${tenant.ai_provider} ✅`);
    console.log(`Model:       ${tenant.ai_model} ✅`);
    console.log(`Tenant ID:   ${tenant.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 3: Check environment variable
    console.log('Step 3: Checking ANTHROPIC_API_KEY...');
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      console.log(`✅ ANTHROPIC_API_KEY is set (${anthropicKey.substring(0, 10)}...)`);
    } else {
      console.warn('⚠️  ANTHROPIC_API_KEY is NOT set in environment');
      console.warn('   Add it to your .env file:');
      console.warn('   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx');
      console.warn('   Get your key from: https://console.anthropic.com/settings/keys');
    }

    console.log('\n🎉 Switch complete! Next steps:');
    console.log('1. Ensure ANTHROPIC_API_KEY is set in your environment');
    console.log('2. Restart your application');
    console.log('3. Send a test WhatsApp message');
    console.log('4. Check logs for: [AI Agent] Using Anthropic (Claude) as primary provider');
    console.log('5. Verify tool calls work correctly\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

switchToAnthropic();
