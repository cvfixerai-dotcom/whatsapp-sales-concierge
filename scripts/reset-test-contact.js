// Reset script for test contact
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetTestContact() {
  try {
    // Find test contacts
    const { data: contacts, error: findError } = await supabase
      .from('contacts')
      .select('id, whatsapp_number')
      .ilike('whatsapp_number', '%918838923398%');
    
    if (findError) throw findError;
    
    console.log(`Found ${contacts?.length || 0} test contact(s)`);
    
    for (const contact of contacts || []) {
      console.log(`Processing contact: ${contact.whatsapp_number} (${contact.id})`);
      
      // Delete messages
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id);
      
      for (const conv of conversations || []) {
        const { count: msgCount } = await supabase
          .from('messages')
          .delete({ count: 'exact' })
          .eq('conversation_id', conv.id);
        console.log(`  Deleted ${msgCount} messages from conversation ${conv.id}`);
      }
      
      // Delete conversations
      const { count: convCount } = await supabase
        .from('conversations')
        .delete({ count: 'exact' })
        .eq('contact_id', contact.id);
      console.log(`  Deleted ${convCount} conversations`);
      
      // Delete appointments
      const { count: apptCount } = await supabase
        .from('appointments')
        .delete({ count: 'exact' })
        .eq('contact_id', contact.id);
      console.log(`  Deleted ${apptCount} appointments`);
      
      // Delete AI processing logs
      const { count: logCount } = await supabase
        .from('ai_processing_logs')
        .delete({ count: 'exact' })
        .eq('contact_id', contact.id);
      console.log(`  Deleted ${logCount} AI processing logs`);
      
      // Reset contact data
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          name: null,
          email: null,
          temperature: 'new',
          budget_range: null,
          service_interest: null,
          timeline: null,
          lead_score: 0,
          metadata: {},
          last_message_at: null,
          qualification_status: 'new',
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id);
      
      if (updateError) throw updateError;
      console.log(`  ✓ Contact reset successfully`);
    }
    
    console.log('\n✅ All test data cleared successfully!');
    console.log('You can now start a fresh conversation.');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetTestContact();
