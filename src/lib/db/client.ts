// @ts-nocheck
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Lazy-loaded Supabase clients to support CLI scripts with dotenv
let _supabaseAdmin: SupabaseClient<Database> | null = null;
let _supabaseClient: SupabaseClient<Database> | null = null;

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _supabaseAdmin;
}

function getSupabaseClient(): SupabaseClient<Database> {
  if (!_supabaseClient) {
    _supabaseClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabaseClient;
}

// Export as getters for lazy initialization
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  }
});

export const supabaseClient = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return (getSupabaseClient() as any)[prop];
  }
});

// Helper to create a client with tenant context
export function createTenantClient(tenantId: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          'x-tenant-id': tenantId,
        },
      },
    }
  );
}

// Database types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Interface definitions for all tables
export interface Tenant {
  id: string;
  company_name: string;
  subscription_tier: 'free' | 'starter' | 'growth' | 'scale' | 'enterprise';
  subscription_status: 'trial' | 'active' | 'cancelled' | 'past_due';
  stripe_customer_id: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_whatsapp_number: string | null;
  calendly_api_key: string | null;
  calendly_event_url: string | null;
  industry: 'real-estate' | 'automotive' | 'home-services' | 'medical' | 'other';
  language: string[];
  business_hours: Json;
  services: Json;
  faqs: Json;
  ai_provider: 'anthropic' | 'openai';
  ai_model: string;
  monthly_conversation_limit: number;
  setup_completed: boolean;
  setup_fee_paid: boolean;
  ai_assistant_name: string | null;
  agent_display_name: string | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  trial_conversation_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  notification_preferences: Json;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  whatsapp_number: string;
  name: string | null;
  email: string | null;
  language: string;
  temperature: 'new' | 'warm' | 'hot' | 'cold' | 'booked' | 'lost';
  leadScore: number;
  qualification_status: 'unqualified' | 'qualified' | 'contacted' | 'converted';
  timeline: 'urgent' | 'this-week' | 'this-month' | 'exploring' | 'not-specified' | null;
  budget_range: string | null;
  service_interest: string | null;
  notes: string | null;
  source: 'organic' | 'referral' | 'paid' | 'direct' | 'other';
  assigned_to: string | null;
  metadata: Json;
  tags: string[];
  first_message_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  conversation_window_start: string;
  conversation_window_end: string | null;
  message_count: number;
  is_active: boolean;
  status: 'active' | 'handoff-requested' | 'human-handling' | 'closed';
  handoff_reason: string | null;
  handled_by: string | null;
  ai_confidence_avg: number | null;
  summary: string | null;
  key_insights: Json;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  tenant_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'contact' | 'ai' | 'human';
  sender_id: string | null;
  content: string;
  language: string | null;
  twilio_message_sid: string | null;
  ai_confidence: number | null;
  ai_intent: string | null;
  ai_sentiment: string | null;
  requires_handoff: boolean;
  handoff_reason: string | null;
  metadata: Json;
  created_at: string;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  contact_id: string;
  conversation_id: string | null;
  calendly_event_id: string | null;
  scheduled_time: string;
  duration_minutes: number;
  meeting_link: string | null;
  meeting_type: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  reminder_sent: boolean;
  reminder_count: number;
  notes: string | null;
  calendar_synced: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIPrompt {
  id: string;
  tenant_id: string | null;
  name: string;
  industry: string | null;
  language: string;
  prompt_type: 'system' | 'qualification' | 'booking' | 'followup' | 'handoff' | 'custom';
  content: string;
  variables: Json;
  is_active: boolean;
  version: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  tenant_id: string | null;
  idempotency_key: string;
  source: 'twilio' | 'calendly' | 'stripe';
  event_type: string;
  payload: Json;
  processed: boolean;
  processed_at: string | null;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface ConversationUsage {
  id: string;
  tenant_id: string;
  billing_month: string;
  conversation_count: number;
  overage_count: number;
  overage_rate: number;
  amount_due: number;
  stripe_invoice_id: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateLimit {
  id: string;
  tenant_id: string;
  whatsapp_number: string;
  window_start: string;
  message_count: number;
  window_duration_seconds: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Json;
  new_values: Json;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Database view types
export interface ConversationSummary {
  id: string;
  tenant_id: string;
  contact_id: string;
  contact_name: string | null;
  whatsapp_number: string;
  temperature: string;
  leadScore: number;
  message_count: number;
  status: string;
  conversation_start: string;
  last_message_at: string | null;
}

export interface TenantUsageStats {
  tenant_id: string;
  company_name: string;
  subscription_tier: string;
  monthly_conversation_limit: number;
  current_month_conversations: number;
  overage: number;
  is_over_limit: boolean;
}

// Helper functions for common operations
export class DatabaseService {
  static async getTenantByUserId(userId: string): Promise<Tenant | null> {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    
    if (!user?.tenant_id) return null;
    
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', user.tenant_id)
      .single();
    
    return tenant;
  }

  static async createConversation(
    tenantId: string,
    contactId: string
  ): Promise<Conversation> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        conversation_window_start: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async addMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'created_at'>
  ): Promise<Message> {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert(message)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async updateContactTemperature(
    contactId: string,
    temperature: Contact['temperature'],
    leadScore: number
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('contacts')
      .update({
        temperature,
        lead_score: leadScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);
    
    if (error) throw error;
  }

  static async checkRateLimit(
    tenantId: string,
    whatsappNumber: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    const windowStart = new Date();
    windowStart.setSeconds(windowStart.getSeconds() - 1);
    
    const { data: rateLimit } = await supabaseAdmin
      .from('rate_limits')
      .select('message_count')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', whatsappNumber)
      .gte('window_start', windowStart.toISOString())
      .single();
    
    const currentCount = rateLimit?.message_count || 0;
    const maxMessagesPerSecond = 1;
    const allowed = currentCount < maxMessagesPerSecond;
    const remaining = Math.max(0, maxMessagesPerSecond - currentCount);
    
    if (allowed) {
      // Update or create rate limit record
      if (rateLimit) {
        await supabaseAdmin
          .from('rate_limits')
          .update({ message_count: currentCount + 1 })
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', whatsappNumber)
          .eq('window_start', windowStart.toISOString());
      } else {
        await supabaseAdmin
          .from('rate_limits')
          .insert({
            tenant_id: tenantId,
            whatsapp_number: whatsappNumber,
            window_start: windowStart.toISOString(),
            message_count: 1,
          });
      }
    }
    
    return { allowed, remaining };
  }

  static async trackConversationUsage(tenantId: string): Promise<void> {
    const billingMonth = new Date();
    billingMonth.setDate(1);
    billingMonth.setHours(0, 0, 0, 0);
    
    const { data: usage } = await supabaseAdmin
      .from('conversation_usage')
      .select('conversation_count')
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth.toISOString())
      .single();
    
    if (usage) {
      await supabaseAdmin
        .from('conversation_usage')
        .update({
          conversation_count: usage.conversation_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('billing_month', billingMonth.toISOString());
    } else {
      await supabaseAdmin
        .from('conversation_usage')
        .insert({
          tenant_id: tenantId,
          billing_month: billingMonth.toISOString(),
          conversation_count: 1,
        });
    }
  }
}
