// @ts-nocheck
/**
 * Onboarding API
 * GET - Get current onboarding status
 * POST - Update onboarding progress
 */

import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';
import { createDefaultFollowUpSequences } from '@/lib/services/followup-templates';
import { initializeTenantDefaults } from '@/lib/services/tenant-initializer';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select(`
        setup_completed,
        onboarding_step,
        onboarding_data,
        company_name,
        business_type,
        business_description,
        target_audience,
        products_services,
        business_hours,
        timezone,
        ai_personality,
        ai_language,
        ai_greeting,
        ai_fallback_message,
        qualification_questions,
        twilio_account_sid,
        twilio_whatsapp_number,
        calendar_provider,
        handoff_settings
      `)
      .eq('id', sessionUser.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Calculate completion status for each step
    const steps = [
      {
        id: 'business_profile',
        name: 'Business Profile',
        completed: !!(tenant.company_name && tenant.business_type && tenant.business_description),
      },
      {
        id: 'twilio_setup',
        name: 'WhatsApp Setup',
        completed: !!(tenant.twilio_account_sid && tenant.twilio_whatsapp_number),
      },
      {
        id: 'ai_config',
        name: 'AI Configuration',
        completed: !!(tenant.ai_greeting),
      },
      {
        id: 'calendar_setup',
        name: 'Calendar',
        completed: true,
      },
      {
        id: 'handoff_setup',
        name: 'Handoff Notifications',
        completed: !!(tenant.handoff_settings?.recipients?.email || tenant.handoff_settings?.recipients?.whatsapp),
      },
    ];

    const completedSteps = steps.filter(s => s.completed).length;
    const progress = Math.round((completedSteps / steps.length) * 100);

    return NextResponse.json({
      setup_completed: tenant.setup_completed,
      current_step: tenant.onboarding_step,
      progress,
      steps,
      tenant: {
        company_name: tenant.company_name,
        business_type: tenant.business_type,
        business_description: tenant.business_description,
        target_audience: tenant.target_audience,
        products_services: tenant.products_services,
        business_hours: tenant.business_hours,
        timezone: tenant.timezone,
        ai_personality: tenant.ai_personality,
        ai_language: tenant.ai_language,
        ai_greeting: tenant.ai_greeting,
        ai_fallback_message: tenant.ai_fallback_message,
        qualification_questions: tenant.qualification_questions,
        twilio_configured: !!(tenant.twilio_account_sid && tenant.twilio_whatsapp_number),
        handoff_settings: tenant.handoff_settings,
      },
    });
  } catch (error) {
    console.error('[Onboarding API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { step, data, action } = body;

    // Build update object based on step
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (action === 'complete_onboarding') {
      updates.setup_completed = true;
      updates.onboarding_completed = true;
      updates.setup_completed_at = new Date().toISOString();
    } else if (action === 'update_step') {
      updates.onboarding_step = step;
    }

    // Handle step-specific data
    if (data) {
      switch (step) {
        case 0: // Business Profile
          if (data.company_name) updates.company_name = data.company_name;
          if (data.business_type) {
            updates.business_type = data.business_type;
            const industryMap: Record<string, string> = {
              'real_estate': 'real-estate', 'automotive': 'automotive',
              'healthcare': 'medical', 'home_services': 'home-services',
            };
            updates.industry = industryMap[data.business_type] || 'other';
          }
          if (data.business_description) updates.business_description = data.business_description;
          if (data.target_audience) updates.target_audience = data.target_audience;
          if (data.products_services) updates.products_services = data.products_services;
          if (data.business_hours) updates.business_hours = data.business_hours;
          if (data.timezone) updates.timezone = data.timezone;
          if (data.agent_display_name) updates.agent_display_name = data.agent_display_name;
          break;

        case 1: // Twilio Setup
          if (data.twilio_account_sid) updates.twilio_account_sid = data.twilio_account_sid;
          if (data.twilio_auth_token) updates.twilio_auth_token = data.twilio_auth_token;
          if (data.twilio_whatsapp_number) updates.twilio_whatsapp_number = data.twilio_whatsapp_number;
          break;

        case 2: // AI Configuration
          if (data.ai_personality) updates.ai_personality = data.ai_personality;
          if (data.ai_language) updates.ai_language = data.ai_language;
          if (data.ai_greeting) updates.ai_greeting = data.ai_greeting;
          if (data.ai_fallback_message) updates.ai_fallback_message = data.ai_fallback_message;
          if (data.qualification_questions) updates.qualification_questions = data.qualification_questions;
          if (data.ai_assistant_name) updates.ai_assistant_name = data.ai_assistant_name;
          break;

        case 3: // Calendar Setup — initialize availability_settings with business hours
          // Get current tenant data to use timezone and industry
          const { data: tenantData } = await supabaseAdmin
            .from('tenants')
            .select('timezone, industry')
            .eq('id', sessionUser.tenantId)
            .single();
          
          const timezone = tenantData?.timezone || 'UTC';
          const industry = tenantData?.industry || 'other';
          const businessHours = data.business_hours || null;
          
          await initializeTenantDefaults(sessionUser.tenantId, {
            timezone,
            industry,
            businessHours,
          });
          console.log('[Onboarding] ✅ Calendar initialized for tenant');
          break;

        case 4: // Handoff Setup
          if (data.handoff_settings) updates.handoff_settings = data.handoff_settings;
          break;
      }
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', sessionUser.tenantId);

    if (error) {
      console.error('[Onboarding API] Update error:', error);
      return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
    }

    // Auto-create follow-up sequences when industry is set (Step 0)
    if (step === 0 && updates.industry) {
      await createDefaultFollowUpSequences(sessionUser.tenantId, updates.industry);
    }

    // Log onboarding progress
    await supabaseAdmin.from('onboarding_logs').insert({
      tenant_id: sessionUser.tenantId,
      step_name: getStepName(step),
      step_number: step,
      status: 'completed',
      data: data || {},
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Onboarding API] POST error:', error);
    return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
  }
}

function getStepName(step: number): string {
  const names = [
    'business_profile',
    'twilio_setup',
    'ai_config',
    'calendar_setup',
    'handoff_setup',
  ];
  return names[step] || 'unknown';
}
