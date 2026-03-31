// @ts-nocheck
/**
 * Calendar Settings API — Internal In-App Calendar Only
 * Calendly and Google Calendar integrations have been removed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get tenant info to check Google Calendar connection
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('google_refresh_token, google_calendar_id, calendar_provider')
      .eq('id', sessionUser.tenantId)
      .single();

    const { data: settings } = await supabaseAdmin
      .from('availability_settings')
      .select('*')
      .eq('tenant_id', sessionUser.tenantId)
      .maybeSingle();

    return NextResponse.json({ 
      calendar_provider: tenant?.calendar_provider || 'inapp',
      google_connected: !!tenant?.google_refresh_token,
      google_calendar_id: tenant?.google_calendar_id || null,
      availability_settings: settings ?? null 
    });
  } catch (error) {
    console.error('[Calendar Settings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { availability_settings, disconnect_google } = body;

    // Handle Google Calendar disconnect
    if (disconnect_google) {
      const { error } = await supabaseAdmin
        .from('tenants')
        .update({
          google_refresh_token: null,
          google_calendar_id: null,
          calendar_provider: 'inapp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionUser.tenantId);
      
      if (error) {
        console.error('[Calendar Settings] Disconnect error:', error);
        return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
    }

    if (availability_settings) {
      const { error } = await supabaseAdmin
        .from('availability_settings')
        .upsert({ ...availability_settings, tenant_id: sessionUser.tenantId }, { onConflict: 'tenant_id' });
      if (error) {
        console.error('[Calendar Settings] Upsert error:', error);
        return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Calendar Settings] POST error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
