// @ts-nocheck
/**
 * Investigation Script: AI Configuration Analysis
 * This script investigates the current AI system configuration
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigateAIConfig() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  AI SYSTEM CONFIGURATION INVESTIGATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // PART 1: TENANT CONFIGURATION
  console.log('📋 PART 1: TENANT CONFIGURATION\n');
  
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('company_name', 'Dubai Elite Properties')
    .single();

  if (tenantError) {
    console.error('❌ Error fetching tenant:', tenantError);
    return;
  }

  console.log('Tenant ID:', tenant.id);
  console.log('Company Name:', tenant.company_name);
  console.log('AI Provider:', tenant.ai_provider || 'NOT SET (will use default)');
  console.log('AI Model:', tenant.ai_model || 'NOT SET (will use default)');
  console.log('Timezone:', tenant.timezone || 'NOT SET');
  console.log('Industry:', tenant.industry || 'NOT SET');
  console.log('AI Assistant Name:', tenant.ai_assistant_name || 'NOT SET');
  console.log('Agent Display Name:', tenant.agent_display_name || 'NOT SET');

  // PART 2: ENVIRONMENT VARIABLES
  console.log('\n📋 PART 2: ENVIRONMENT VARIABLES\n');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ SET (length: ' + process.env.OPENAI_API_KEY.length + ')' : '❌ NOT SET');
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ SET (length: ' + process.env.ANTHROPIC_API_KEY.length + ')' : '❌ NOT SET');

  // PART 3: CUSTOM PROMPT
  console.log('\n📋 PART 3: CUSTOM AI PROMPT\n');
  
  const { data: customPrompt } = await supabase
    .from('ai_prompts')
    .select('content, created_at, updated_at')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (customPrompt) {
    console.log('Custom Prompt Found: ✅');
    console.log('Created:', customPrompt.created_at);
    console.log('Updated:', customPrompt.updated_at);
    console.log('Content Preview:', customPrompt.content.substring(0, 200) + '...');
  } else {
    console.log('Custom Prompt: ❌ NOT SET (using default prompts)');
  }

  // PART 4: AVAILABILITY SETTINGS
  console.log('\n📋 PART 4: AVAILABILITY SETTINGS (for check_calendar)\n');
  
  const { data: availability } = await supabase
    .from('availability_settings')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single();

  if (availability) {
    console.log('Timezone:', availability.timezone);
    console.log('Slot Duration:', availability.slot_duration, 'minutes');
    console.log('Buffer Time:', availability.buffer_time, 'minutes');
    console.log('Min Notice Hours:', availability.min_notice_hours);
    console.log('Booking Window Days:', availability.booking_window_days);
    console.log('\nBusiness Hours:');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const enabled = availability[`${day}_enabled`];
      const start = availability[`${day}_start`];
      const end = availability[`${day}_end`];
      console.log(`  ${day.charAt(0).toUpperCase() + day.slice(1)}:`, enabled ? `${start} - ${end}` : 'CLOSED');
    });
  } else {
    console.log('❌ No availability settings found (using defaults)');
  }

  // PART 5: RECENT APPOINTMENTS
  console.log('\n📋 PART 5: RECENT APPOINTMENTS (to check timezone storage)\n');
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, scheduled_time, duration_minutes, status, customer_name, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (appointments && appointments.length > 0) {
    appointments.forEach((apt, idx) => {
      console.log(`\nAppointment ${idx + 1}:`);
      console.log('  ID:', apt.id);
      console.log('  Customer:', apt.customer_name);
      console.log('  Scheduled Time (UTC):', apt.scheduled_time);
      console.log('  Duration:', apt.duration_minutes, 'minutes');
      console.log('  Status:', apt.status);
      console.log('  Created:', apt.created_at);
    });
  } else {
    console.log('No appointments found');
  }

  // PART 6: RECENT CONVERSATIONS
  console.log('\n📋 PART 6: RECENT CONVERSATIONS (to check AI behavior)\n');
  
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, contact_id, status, last_message_at')
    .eq('tenant_id', tenant.id)
    .order('last_message_at', { ascending: false })
    .limit(3);

  if (conversations && conversations.length > 0) {
    for (const conv of conversations) {
      console.log(`\nConversation ${conv.id}:`);
      
      const { data: messages } = await supabase
        .from('messages')
        .select('sender_type, content, created_at, metadata')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (messages) {
        console.log(`  Last ${messages.length} messages:`);
        messages.reverse().forEach((msg, idx) => {
          const toolCalls = msg.metadata?.tool_calls;
          const toolInfo = toolCalls ? ` [TOOLS: ${toolCalls.map((t: any) => t.name).join(', ')}]` : '';
          console.log(`    ${idx + 1}. [${msg.sender_type}] ${msg.content.substring(0, 80)}...${toolInfo}`);
        });
      }
    }
  }

  // PART 7: PROVIDER SELECTION LOGIC
  console.log('\n📋 PART 7: AI PROVIDER SELECTION LOGIC\n');
  console.log('Based on code analysis:');
  console.log('1. Primary: OpenAI (if OPENAI_API_KEY is set)');
  console.log('2. Fallback: Anthropic (if OpenAI fails or key not set)');
  console.log('\nCurrent selection:');
  if (process.env.OPENAI_API_KEY) {
    console.log('✅ Will use: OpenAI (gpt-4o)');
    console.log('   Reason: OPENAI_API_KEY is set');
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log('✅ Will use: Anthropic (claude-3-haiku)');
    console.log('   Reason: OPENAI_API_KEY not set, falling back to Anthropic');
  } else {
    console.log('❌ ERROR: No AI provider keys set!');
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  INVESTIGATION COMPLETE                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

investigateAIConfig().catch(console.error);
