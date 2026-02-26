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

    const { data: settings } = await supabaseAdmin
      .from('availability_settings')
      .select('*')
      .eq('tenant_id', sessionUser.tenantId)
      .maybeSingle();

    return NextResponse.json({ calendar_provider: 'inapp', availability_settings: settings ?? null });
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
    const { availability_settings } = body;

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
