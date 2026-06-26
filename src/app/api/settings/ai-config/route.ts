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
        .select('ai_greeting, company_name, industry, industry_agent_id, agent_config')
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

    // Did this tenant actually get a tuned agent for its own industry, or did
    // applyIndustryAgent() (src/lib/services/tenant-initializer.ts) fall back
    // to the generic "other" row because no industry_agents match existed?
    // Surface that so the owner isn't left thinking they got a bespoke
    // configuration when they got the generic one.
    let usingFallbackIndustry = false;
    if (tenant.industry && tenant.industry !== 'other' && tenant.industry_agent_id) {
      const { data: matchedAgent } = await supabaseAdmin
        .from('industry_agents')
        .select('industry')
        .eq('id', tenant.industry_agent_id)
        .maybeSingle();
      usingFallbackIndustry = !!matchedAgent && matchedAgent.industry !== tenant.industry;
    }

    return NextResponse.json({
      ai_greeting: tenant.ai_greeting || '',
      company_name: tenant.company_name || '',
      industry: tenant.industry || 'other',
      agent_name: (tenant.agent_config as any)?.agent_name || 'Maya',
      custom_system_prompt: promptResult?.data?.content || '',
      using_fallback_industry: usingFallbackIndustry,
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
    const { ai_greeting, custom_system_prompt } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (ai_greeting !== undefined) updates.ai_greeting = ai_greeting || null;

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
