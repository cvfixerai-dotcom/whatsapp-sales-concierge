import 'dotenv/config';
import { supabaseAdmin } from '../lib/db/client';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, company_name, timezone, business_hours')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();
  console.log('data:', JSON.stringify(data, null, 2));
  console.log('error:', JSON.stringify(error, null, 2));
}

main();
