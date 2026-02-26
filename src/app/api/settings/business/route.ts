// @ts-nocheck
/**
 * Business Settings API — business_hours, services, faqs, qualification_questions
 * GET  - Fetch current business settings
 * POST - Update business settings
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
      .select('business_hours, services, faqs, qualification_questions, company_name, industry')
      .eq('id', sessionUser.tenantId)
      .single();

    if (error || !tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    return NextResponse.json({
      business_hours: tenant.business_hours ?? {},
      services: tenant.services ?? [],
      faqs: tenant.faqs ?? [],
      qualification_questions: tenant.qualification_questions ?? [],
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
    const { business_hours, services, faqs, qualification_questions } = body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (business_hours !== undefined) updates.business_hours = business_hours;
    if (services !== undefined) updates.services = Array.isArray(services) ? services : [];
    if (faqs !== undefined) updates.faqs = Array.isArray(faqs) ? faqs : [];
    if (qualification_questions !== undefined)
      updates.qualification_questions = Array.isArray(qualification_questions) ? qualification_questions : [];

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
