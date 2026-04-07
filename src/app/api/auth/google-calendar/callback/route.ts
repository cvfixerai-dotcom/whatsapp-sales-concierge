/**
 * Google Calendar OAuth Callback
 * Handles token exchange after user grants consent
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * GET /api/auth/google-calendar/callback
 * Handles OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[Google Calendar Callback] OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=google_oauth_denied`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=missing_params`
      );
    }

    // Decode state to get tenant info
    let stateData: { tenantId: string; userId: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=invalid_state`
      );
    }

    const { tenantId, userId } = stateData;

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Google Calendar Callback] Token exchange failed:', errorText);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token } = tokens;

    if (!refresh_token) {
      console.error('[Google Calendar Callback] No refresh token received');
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=no_refresh_token`
      );
    }

    // Get user's primary calendar ID
    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    let calendarId = 'primary';
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      calendarId = calendarData.id || 'primary';
    }

    // Update tenant with Google Calendar credentials
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        calendar_provider: 'google',
        google_calendar_id: calendarId,
        google_refresh_token: refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateError) {
      console.error('[Google Calendar Callback] Failed to update tenant:', updateError);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/settings?error=save_failed`
      );
    }

    console.log(`[Google Calendar] Successfully connected for tenant ${tenantId}`);

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/settings?tab=calendar&success=true`
    );
  } catch (error) {
    console.error('[Google Calendar Callback] Unexpected error:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/settings?error=unexpected_error`
    );
  }
}
