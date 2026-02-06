// @ts-nocheck
/**
 * Calendar Settings API
 * GET - Fetch current calendar settings
 * POST - Update calendar settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * GET /api/settings/calendar
 * Fetch current calendar settings for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('calendar_provider, calendly_api_key, calendly_event_url, google_calendar_id, google_refresh_token')
      .eq('id', session.user.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Mask the API key for security (show only last 4 chars)
    const maskedApiKey = tenant.calendly_api_key
      ? `${'*'.repeat(Math.max(0, tenant.calendly_api_key.length - 4))}${tenant.calendly_api_key.slice(-4)}`
      : null;

    return NextResponse.json({
      calendar_provider: tenant.calendar_provider,
      calendly_api_key: maskedApiKey,
      calendly_api_key_set: !!tenant.calendly_api_key,
      calendly_event_url: tenant.calendly_event_url,
      google_calendar_id: tenant.google_calendar_id,
      google_connected: !!tenant.google_refresh_token,
    });
  } catch (error) {
    console.error('[Calendar Settings] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/calendar
 * Update calendar settings for the tenant
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      calendar_provider,
      calendly_api_key,
      calendly_event_url,
      google_calendar_id,
      google_refresh_token,
    } = body;

    // Build update object
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Handle provider change
    if (calendar_provider !== undefined) {
      updates.calendar_provider = calendar_provider;
    }

    // Handle Calendly settings
    if (calendly_api_key !== undefined) {
      // Only update if it's a new value (not the masked one)
      if (!calendly_api_key.includes('*')) {
        updates.calendly_api_key = calendly_api_key || null;
      }
    }
    if (calendly_event_url !== undefined) {
      updates.calendly_event_url = calendly_event_url || null;
    }

    // Handle Google Calendar settings
    if (google_calendar_id !== undefined) {
      updates.google_calendar_id = google_calendar_id;
    }
    if (google_refresh_token !== undefined) {
      updates.google_refresh_token = google_refresh_token;
    }

    // Update tenant
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', session.user.tenantId);

    if (error) {
      console.error('[Calendar Settings] Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    console.log(`[Calendar Settings] Updated for tenant ${session.user.tenantId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Calendar Settings] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
