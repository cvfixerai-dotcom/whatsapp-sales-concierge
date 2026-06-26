/**
 * Google Calendar OAuth Flow
 * Handles authorization and token exchange for Google Calendar integration
 */

import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

/**
 * GET /api/auth/google-calendar
 * Initiates OAuth flow - redirects to Google consent screen
 */
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Google OAuth not configured' },
        { status: 500 }
      );
    }

    // Get the base URL for redirect — must match the logic in
    // /api/auth/google-calendar/callback/route.ts exactly, since Google
    // requires the redirect_uri at token-exchange time to be identical to
    // the one used here.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    // Store tenant ID in state for callback
    const state = Buffer.from(JSON.stringify({
      tenantId: sessionUser.tenantId,
      userId: sessionUser.userId,
    })).toString('base64');

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[Google Calendar OAuth] Error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
