/**
 * Business Settings API — business_hours, services, faqs
 * GET  - Fetch current business settings
 * POST - Update business settings
 *
 * Note: qualification_questions used to live here too, but it was never read
 * by the AI agent (src/lib/ai/agent.ts / prompts.ts) — real lead-qualification
 * questions come from the industry_agents registry (agent_config.system_prompt
 * / qualification_stages, applied via applyIndustryAgent at signup/onboarding).
 * Removed to avoid a dead, confusing duplicate control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('business_hours, services, faqs, company_name, industry')
      .eq('id', sessionUser.tenantId)
      .single();

    if (error || !tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    return NextResponse.json({
      business_hours: tenant.business_hours ?? {},
      services: tenant.services ?? [],
      faqs: tenant.faqs ?? [],
      company_name: tenant.company_name || '',
      industry: tenant.industry || 'other',
    });
  } catch (error) {
    console.error('[Business Settings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch business settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { business_hours, services, faqs } = body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (business_hours !== undefined) updates.business_hours = business_hours;
    if (services !== undefined) updates.services = Array.isArray(services) ? services : [];
    if (faqs !== undefined) updates.faqs = Array.isArray(faqs) ? faqs : [];

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', sessionUser.tenantId);

    if (error) {
      console.error('[Business Settings] Update error:', error);
      return NextResponse.json({ error: 'Failed to update business settings' }, { status: 500 });
    }

    console.log(`[Business Settings] Updated for tenant ${sessionUser.tenantId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Business Settings] POST error:', error);
    return NextResponse.json({ error: 'Failed to update business settings' }, { status: 500 });
  }
}
