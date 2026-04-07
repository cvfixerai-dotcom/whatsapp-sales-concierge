/**
 * AI Configuration Settings API
 * GET - Fetch current AI config
 * POST - Update AI config
 */

import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [tenantResult, promptResult] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('ai_personality, ai_language, ai_greeting, ai_fallback_message, qualification_questions, company_name, industry')
        .eq('id', sessionUser.tenantId)
        .single(),
      supabaseAdmin
        .from('ai_prompts')
        .select('content')
        .eq('tenant_id', sessionUser.tenantId)
        .eq('prompt_type', 'system')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (tenantResult.error || !tenantResult.data) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenant = tenantResult.data;

    return NextResponse.json({
      ai_personality: tenant.ai_personality || 'professional',
      ai_language: tenant.ai_language || 'en',
      ai_greeting: tenant.ai_greeting || '',
      ai_fallback_message: tenant.ai_fallback_message || '',
      qualification_questions: tenant.qualification_questions || [],
      company_name: tenant.company_name || '',
      industry: tenant.industry || 'other',
      custom_system_prompt: promptResult?.data?.content || '',
    });
  } catch (error) {
    console.error('[AI Config] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch AI config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ai_personality, ai_language, ai_greeting, ai_fallback_message, qualification_questions, custom_system_prompt } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (ai_personality !== undefined) updates.ai_personality = ai_personality;
    if (ai_language !== undefined) updates.ai_language = ai_language;
    if (ai_greeting !== undefined) updates.ai_greeting = ai_greeting || null;
    if (ai_fallback_message !== undefined) updates.ai_fallback_message = ai_fallback_message || null;
    if (qualification_questions !== undefined) updates.qualification_questions = qualification_questions;

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', sessionUser.tenantId);

    if (error) {
      console.error('[AI Config] Update error:', error);
      return NextResponse.json({ error: 'Failed to update AI config' }, { status: 500 });
    }

    // Save custom system prompt to ai_prompts table
    if (custom_system_prompt !== undefined) {
      // Deactivate existing custom system prompts
      await supabaseAdmin
        .from('ai_prompts')
        .update({ is_active: false })
        .eq('tenant_id', sessionUser.tenantId)
        .eq('prompt_type', 'system');

      // Insert new custom prompt if not empty
      if (custom_system_prompt.trim()) {
        const { error: promptErr } = await supabaseAdmin
          .from('ai_prompts')
          .insert({
            tenant_id: sessionUser.tenantId,
            name: 'Custom System Prompt',
            prompt_type: 'system',
            content: custom_system_prompt.trim(),
            is_active: true,
            description: 'Custom system prompt set via settings page',
          });
        if (promptErr) {
          console.error('[AI Config] Prompt save error:', promptErr);
        }
      }
    }

    console.log(`[AI Config] Updated for tenant ${sessionUser.tenantId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI Config] POST error:', error);
    return NextResponse.json({ error: 'Failed to update AI config' }, { status: 500 });
  }
}
