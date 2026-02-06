// @ts-nocheck
/**
 * Onboarding API
 * GET - Get current onboarding status
 * POST - Update onboarding progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select(`
        onboarding_completed,
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
      .eq('id', session.user.tenantId)
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
        name: 'Calendar Integration',
        completed: !!(tenant.calendar_provider),
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
      onboarding_completed: tenant.onboarding_completed,
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
        calendar_provider: tenant.calendar_provider,
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { step, data, action } = body;

    // Build update object based on step
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (action === 'complete_onboarding') {
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
          if (data.business_type) updates.business_type = data.business_type;
          if (data.business_description) updates.business_description = data.business_description;
          if (data.target_audience) updates.target_audience = data.target_audience;
          if (data.products_services) updates.products_services = data.products_services;
          if (data.business_hours) updates.business_hours = data.business_hours;
          if (data.timezone) updates.timezone = data.timezone;
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
          break;

        case 3: // Calendar Setup
          if (data.calendar_provider !== undefined) updates.calendar_provider = data.calendar_provider;
          if (data.calendly_api_key) updates.calendly_api_key = data.calendly_api_key;
          if (data.calendly_event_url) updates.calendly_event_url = data.calendly_event_url;
          break;

        case 4: // Handoff Setup
          if (data.handoff_settings) updates.handoff_settings = data.handoff_settings;
          break;
      }
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', session.user.tenantId);

    if (error) {
      console.error('[Onboarding API] Update error:', error);
      return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
    }

    // Log onboarding progress
    await supabaseAdmin.from('onboarding_logs').insert({
      tenant_id: session.user.tenantId,
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
