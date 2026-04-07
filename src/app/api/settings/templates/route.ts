/**
 * WhatsApp Template Messages API
 * GET - Fetch current templates
 * POST - Update templates
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

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_templates')
      .eq('id', sessionUser.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const defaults = {
      appointment_reminder: 'Hi {{contact_name}}, this is a friendly reminder about your appointment scheduled for {{appointment_time}}. Reply YES to confirm or RESCHEDULE to pick a new time.',
      follow_up: 'Hi {{contact_name}}, just checking in! We spoke recently about {{topic}}. Do you have any questions I can help with?',
      welcome: 'Welcome to {{company_name}}! We\'re excited to help you. How can we assist you today?',
    };

    return NextResponse.json({
      templates: tenant.whatsapp_templates || defaults,
    });
  } catch (error) {
    console.error('[Templates] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { templates } = body;

    if (!templates || typeof templates !== 'object') {
      return NextResponse.json({ error: 'Invalid templates data' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        whatsapp_templates: templates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionUser.tenantId);

    if (error) {
      console.error('[Templates] Update error:', error);
      return NextResponse.json({ error: 'Failed to update templates' }, { status: 500 });
    }

    console.log(`[Templates] Updated for tenant ${sessionUser.tenantId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Templates] POST error:', error);
    return NextResponse.json({ error: 'Failed to update templates' }, { status: 500 });
  }
}
