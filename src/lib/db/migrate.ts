import { config } from 'dotenv';
config(); // Load .env file

import { supabaseAdmin } from './client';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    // Read the schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql_statement: statement });
        
        if (error) {
          // If the RPC doesn't exist, we'll need to run this manually in Supabase dashboard
          console.error('Error executing statement:', error);
          console.log('Please run the schema.sql manually in the Supabase SQL editor');
          return false;
        }
      }
    }
    
    console.log('Migrations completed successfully!');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

// Helper to seed initial data
export async function seedInitialData() {
  try {
    console.log('Seeding initial data...');
    
    // Create default AI prompts if they don't exist
    const defaultPrompts = [
      {
        name: 'System Prompt - English',
        prompt_type: 'system',
        language: 'en',
        content: `You are SalesConcierge AI, a professional sales assistant for {{company_name}}.

Your goal is to qualify leads and book appointments. Be friendly, professional, and concise.

Key guidelines:
- Always respond in the same language as the customer
- Ask qualifying questions naturally
- Never make up information about services
- If you don't know something, offer to connect them with a human

Available services: {{services}}
Business hours: {{business_hours}}
Qualification criteria: {{qualification_criteria}}`
      },
      {
        name: 'System Prompt - Arabic',
        prompt_type: 'system',
        language: 'ar',
        content: `أنت SalesConcierge AI، مساعد مبيعات احترافي لشركة {{company_name}}.

هدفك هو تأهيل العملاء المحتملين وحجز المواعيد. كن ودودًا ومحترفًا وموجزًا.

إرشادات رئيسية:
- دائمًا رد بنفس لغة العميل
- اطرف أسئلة التأهيل بشكل طبيعي
- لا تخترع معلومات عن الخدمات
- إذا كنت لا تعرف شيئًا، فعرض توصيلهم بشخص

الخدمات المتاحة: {{services}}
ساعات العمل: {{business_hours}}
معايير التأهيل: {{qualification_criteria}}`
      },
      {
        name: 'Qualification Questions',
        prompt_type: 'qualification',
        language: 'en',
        content: `Based on the customer's message, determine:
1. Interest level (0-100)
2. Qualification status
3. Timeline
4. Budget (if mentioned)
5. Specific service interest

Ask follow-up questions to gather this information naturally.`
      },
      {
        name: 'Booking Flow',
        prompt_type: 'booking',
        language: 'en',
        content: `When a qualified lead wants to book:
1. Check availability via Calendly
2. Offer 2-3 suitable time slots
3. Confirm their preferred time
4. Send calendar invitation
5. Set reminder for 24 hours before`
      }
    ];
    
    for (const prompt of defaultPrompts) {
      const { error } = await supabaseAdmin
        .from('ai_prompts')
        .upsert(prompt, { onConflict: 'name,language,prompt_type' });
      
      if (error) {
        console.error('Error seeding prompt:', error);
      }
    }
    
    console.log('Initial data seeded successfully!');
    return true;
  } catch (error) {
    console.error('Seeding failed:', error);
    return false;
  }
}

// Create a test tenant for development
export async function createTestTenant() {
  try {
    console.log('Creating test tenant...');
    
    const testTenant = {
      company_name: 'Test Company',
      subscription_tier: 'starter' as const,
      subscription_status: 'active' as const,
      industry: 'other' as const,
      ai_provider: 'anthropic' as const,
      ai_model: 'claude-3-sonnet-20240229',
      monthly_conversation_limit: 500,
      business_hours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: { closed: true },
        sunday: { closed: true }
      },
      services: [
        { name: 'Consultation', duration: 30, price: 100 },
        { name: 'Full Service', duration: 60, price: 250 }
      ],
      faqs: [
        { question: 'What are your hours?', answer: 'We are open Monday-Friday 9AM-5PM' },
        { question: 'How much does it cost?', answer: 'Our services start at $100' }
      ]
    };
    
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert(testTenant)
      .select()
      .single();
    
    if (tenantError) throw tenantError;
    
    // Create test user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        email: 'test@example.com',
        password_hash: hashedPassword,
        role: 'owner',
        full_name: 'Test User',
        is_active: true
      });
    
    if (userError) throw userError;
    
    console.log('Test tenant created successfully!');
    console.log('Email: test@example.com');
    console.log('Password: password123');
    
    return tenant;
  } catch (error) {
    console.error('Failed to create test tenant:', error);
    return null;
  }
}

// Command line interface for running migrations
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      runMigrations();
      break;
    case 'seed':
      seedInitialData();
      break;
    case 'test-tenant':
      createTestTenant();
      break;
    default:
      console.log('Usage:');
      console.log('  npm run db migrate     - Run database migrations');
      console.log('  npm run db seed        - Seed initial data');
      console.log('  npm run db test-tenant - Create test tenant');
  }
}
