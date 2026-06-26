/**
 * Tenant Initialization Service
 * 
 * Automatically creates default records for new tenants:
 * - availability_settings (calendar configuration)
 * - business_hours (in tenants table)
 * - services (industry-specific defaults)
 * - faqs (industry-specific defaults)
 * 
 * Called after signup and during onboarding to ensure
 * all tenants have working calendar and AI configuration.
 */

import { supabaseAdmin } from '../db/client';

export interface TenantInitOptions {
  timezone?: string;
  industry?: string;
  businessHours?: Record<string, any>;
  services?: any[];
  faqs?: any[];
}

export async function initializeTenantDefaults(
  tenantId: string,
  options: TenantInitOptions = {}
) {
  const timezone = options.timezone || 'UTC';
  const industry = options.industry || 'other';

  console.log(`[TenantInit] Initializing tenant ${tenantId.substring(0, 8)}... with timezone=${timezone}, industry=${industry}`);

  // 1. Default business hours (Mon-Sat 9am-6pm, Sunday closed)
  const defaultBusinessHours = options.businessHours || {
    monday:    { open: '09:00', close: '18:00', closed: false },
    tuesday:   { open: '09:00', close: '18:00', closed: false },
    wednesday: { open: '09:00', close: '18:00', closed: false },
    thursday:  { open: '09:00', close: '18:00', closed: false },
    friday:    { open: '09:00', close: '18:00', closed: false },
    saturday:  { open: '09:00', close: '18:00', closed: false },
    sunday:    { open: '09:00', close: '18:00', closed: true },
  };

  // 2. Default services by industry
  const defaultServices = options.services || getDefaultServices(industry);

  // 3. Default FAQs by industry
  const defaultFaqs = options.faqs || getDefaultFaqs(industry);

  // 4. Create availability_settings record
  // Map business hours to availability_settings format
  const availabilityPayload = {
    tenant_id: tenantId,
    timezone,
    slot_duration: 30,
    buffer_time: 0,
    min_notice_hours: 0.5,
    max_per_day: 10,
    booking_window_days: 30,
    monday_enabled: !defaultBusinessHours.monday.closed,
    monday_start: defaultBusinessHours.monday.open,
    monday_end: defaultBusinessHours.monday.close,
    tuesday_enabled: !defaultBusinessHours.tuesday.closed,
    tuesday_start: defaultBusinessHours.tuesday.open,
    tuesday_end: defaultBusinessHours.tuesday.close,
    wednesday_enabled: !defaultBusinessHours.wednesday.closed,
    wednesday_start: defaultBusinessHours.wednesday.open,
    wednesday_end: defaultBusinessHours.wednesday.close,
    thursday_enabled: !defaultBusinessHours.thursday.closed,
    thursday_start: defaultBusinessHours.thursday.open,
    thursday_end: defaultBusinessHours.thursday.close,
    friday_enabled: !defaultBusinessHours.friday.closed,
    friday_start: defaultBusinessHours.friday.open,
    friday_end: defaultBusinessHours.friday.close,
    saturday_enabled: !defaultBusinessHours.saturday.closed,
    saturday_start: defaultBusinessHours.saturday.open,
    saturday_end: defaultBusinessHours.saturday.close,
    sunday_enabled: !defaultBusinessHours.sunday.closed,
    sunday_start: defaultBusinessHours.sunday.open,
    sunday_end: defaultBusinessHours.sunday.close,
  };

  const { error: availError } = await supabaseAdmin
    .from('availability_settings')
    .upsert(availabilityPayload, { onConflict: 'tenant_id' });

  if (availError) {
    console.error('[TenantInit] Failed to create availability_settings:', availError);
  } else {
    console.log('[TenantInit] ✅ availability_settings created/updated');
  }

  // 5. Update tenants table with defaults
  const { error: tenantError } = await supabaseAdmin
    .from('tenants')
    .update({
      business_hours: defaultBusinessHours,
      services: defaultServices,
      faqs: defaultFaqs,
      timezone: timezone,
    })
    .eq('id', tenantId);

  if (tenantError) {
    console.error('[TenantInit] Failed to update tenant defaults:', tenantError);
  } else {
    console.log('[TenantInit] ✅ tenant defaults updated (business_hours, services, faqs)');
  }

  return { success: !availError && !tenantError };
}

/**
 * Default services per industry
 */
function getDefaultServices(industry: string): any[] {
  const services: Record<string, any[]> = {
    'real-estate': [
      { 
        name: 'Property Viewing', 
        description: 'View residential or commercial properties', 
        duration_minutes: 60, 
        price: 'Free' 
      },
      { 
        name: 'Investment Consultation', 
        description: 'Discuss property investment opportunities', 
        duration_minutes: 45, 
        price: 'Free' 
      },
      { 
        name: 'Property Valuation', 
        description: 'Get a professional property valuation', 
        duration_minutes: 30, 
        price: 'Free' 
      },
    ],
    'medical': [
      { 
        name: 'General Consultation', 
        description: 'General medical consultation', 
        duration_minutes: 30, 
        price: 'Contact us' 
      },
      { 
        name: 'Follow-up Appointment', 
        description: 'Follow-up on previous consultation', 
        duration_minutes: 20, 
        price: 'Contact us' 
      },
      { 
        name: 'Specialist Referral', 
        description: 'Specialist consultation and referral', 
        duration_minutes: 45, 
        price: 'Contact us' 
      },
    ],
    'automotive': [
      { 
        name: 'Test Drive', 
        description: 'Schedule a test drive for any vehicle', 
        duration_minutes: 60, 
        price: 'Free' 
      },
      { 
        name: 'Vehicle Inspection', 
        description: 'Full vehicle inspection and report', 
        duration_minutes: 45, 
        price: 'Contact us' 
      },
      { 
        name: 'Sales Consultation', 
        description: 'Discuss vehicle options and financing', 
        duration_minutes: 30, 
        price: 'Free' 
      },
    ],
    'home-services': [
      { 
        name: 'Service Consultation', 
        description: 'Discuss your home service needs', 
        duration_minutes: 30, 
        price: 'Free' 
      },
      { 
        name: 'On-Site Inspection', 
        description: 'Professional inspection at your location', 
        duration_minutes: 60, 
        price: 'Contact us' 
      },
      { 
        name: 'Follow-up Service', 
        description: 'Follow-up on previous service', 
        duration_minutes: 45, 
        price: 'Contact us' 
      },
    ],
    'other': [
      { 
        name: 'Consultation', 
        description: 'Initial consultation appointment', 
        duration_minutes: 30, 
        price: 'Contact us' 
      },
      { 
        name: 'Follow-up', 
        description: 'Follow-up appointment', 
        duration_minutes: 20, 
        price: 'Contact us' 
      },
      { 
        name: 'Full Appointment', 
        description: 'Full service appointment', 
        duration_minutes: 60, 
        price: 'Contact us' 
      },
    ],
  };
  
  return services[industry] || services['other'];
}

/**
 * Default FAQs per industry
 */
function getDefaultFaqs(industry: string): any[] {
  const faqs: Record<string, any[]> = {
    'real-estate': [
      { 
        question: 'How long does a viewing take?', 
        answer: 'A typical property viewing takes about 45-60 minutes.' 
      },
      { 
        question: 'Is there a fee for viewings?', 
        answer: 'No, property viewings are completely free.' 
      },
      { 
        question: 'Can I reschedule my appointment?', 
        answer: 'Yes, just let us know at least 2 hours before your scheduled time.' 
      },
      { 
        question: 'What documents do I need?', 
        answer: 'No documents needed for a viewing. Our agent will guide you through next steps.' 
      },
    ],
    'medical': [
      { 
        question: 'What should I bring to my appointment?', 
        answer: 'Please bring a valid ID and any previous medical records if available.' 
      },
      { 
        question: 'How long is the wait time?', 
        answer: 'We aim to see you within 10 minutes of your scheduled time.' 
      },
      { 
        question: 'Do you accept walk-ins?', 
        answer: 'We recommend booking in advance. Walk-ins are subject to availability.' 
      },
      { 
        question: 'Can I cancel my appointment?', 
        answer: 'Yes, please cancel at least 2 hours before your appointment time.' 
      },
    ],
    'automotive': [
      { 
        question: 'How long is a test drive?', 
        answer: 'Test drives typically last 30-60 minutes.' 
      },
      { 
        question: 'Do I need to bring anything?', 
        answer: 'Just bring a valid driver\'s license.' 
      },
      { 
        question: 'Can I reschedule?', 
        answer: 'Yes, just message us and we\'ll find a new time.' 
      },
      { 
        question: 'Is there a fee?', 
        answer: 'No, test drives and consultations are completely free.' 
      },
    ],
    'home-services': [
      { 
        question: 'Do you charge for estimates?', 
        answer: 'Initial consultations and estimates are free.' 
      },
      { 
        question: 'How quickly can you come?', 
        answer: 'We typically schedule within 24-48 hours.' 
      },
      { 
        question: 'What areas do you serve?', 
        answer: 'We serve the entire metro area. Contact us to confirm your location.' 
      },
      { 
        question: 'Can I reschedule?', 
        answer: 'Yes, just let us know at least 2 hours in advance.' 
      },
    ],
    'other': [
      { 
        question: 'How do I reschedule?', 
        answer: 'Just message us and we will find a new time that works for you.' 
      },
      { 
        question: 'What should I expect?', 
        answer: 'Our team will reach out to confirm details before your appointment.' 
      },
      { 
        question: 'Is there a cancellation fee?', 
        answer: 'No cancellation fees. Just let us know in advance.' 
      },
    ],
  };
  
  return faqs[industry] || faqs['other'];
}

/**
 * Apply an industry agent (from the industry_agents registry) to a tenant.
 *
 * Looks up the industry_agents row matching `industry`, falling back to
 * 'other' (with a warning) if there's no exact match — e.g. a brand-new
 * vertical that hasn't been seeded yet. Writes the matched config onto
 * tenants.agent_config / tenants.industry_agent_id / tenants.generated_prompt.
 *
 * agent.ts (Phase 2D) prefers tenant.agent_config over the static
 * prompts.ts default whenever agent_config.system_prompt is present, so
 * calling this is what actually "switches on" the industry-specific agent
 * for a tenant. Safe to call multiple times (e.g. re-applied if the
 * business changes industry during onboarding).
 */
export async function applyIndustryAgent(tenantId: string, industry: string) {
  let { data: agent, error } = await supabaseAdmin
    .from('industry_agents')
    .select('*')
    .eq('industry', industry)
    .eq('is_active', true)
    .single();

  if (error || !agent) {
    console.warn(`[TenantInit] No industry_agents match for industry="${industry}" on tenant ${tenantId.substring(0, 8)} — falling back to 'other'`);
    const fallback = await supabaseAdmin
      .from('industry_agents')
      .select('*')
      .eq('industry', 'other')
      .eq('is_active', true)
      .single();
    agent = fallback.data;
    if (fallback.error || !agent) {
      console.error('[TenantInit] No "other" industry_agents fallback row found — cannot apply industry agent:', fallback.error);
      return { success: false, error: 'No industry agent available (not even "other" fallback)' };
    }
  }

  const agentConfig = {
    system_prompt: agent.system_prompt,
    greeting_message: agent.greeting_message,
    qualification_stages: agent.qualification_stages,
    lead_score_weights: agent.lead_score_weights,
    contact_fields: agent.contact_fields,
    handoff_triggers: agent.handoff_triggers,
    agent_name: agent.agent_name,
  };

  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({
      industry_agent_id: agent.id,
      agent_config: agentConfig,
      generated_prompt: agent.system_prompt,
    })
    .eq('id', tenantId);

  if (updateError) {
    console.error('[TenantInit] Failed to apply industry agent to tenant:', updateError);
    return { success: false, error: updateError.message };
  }

  console.log(`[TenantInit] ✅ Applied industry agent "${agent.industry}" to tenant ${tenantId.substring(0, 8)}`);
  return { success: true, industryAgentId: agent.id, industry: agent.industry };
}
