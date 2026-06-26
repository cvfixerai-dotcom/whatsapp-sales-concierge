/**
 * Post-onboarding WhatsApp/Twilio connection settings.
 *
 * Twilio connection is intentionally decoupled from onboarding completion
 * (see src/app/onboarding/page.tsx and src/app/dashboard/layout.tsx) — a
 * tenant's account creation/verification on Twilio's side can take 24-48hrs,
 * so it must not block the rest of setup. This route is where that
 * connection actually gets made, any time after setup, from the dashboard's
 * Settings > WhatsApp tab.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('twilio_account_sid, twilio_whatsapp_number')
    .eq('id', sessionUser.tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  return NextResponse.json({
    connected: !!(tenant.twilio_account_sid && tenant.twilio_whatsapp_number),
    twilio_account_sid: tenant.twilio_account_sid || '',
    twilio_whatsapp_number: tenant.twilio_whatsapp_number || '',
    // Auth token is never sent back to the client once saved.
  });
}

export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const twilio_account_sid = body.twilio_account_sid?.trim();
  const twilio_auth_token = body.twilio_auth_token?.trim();
  const twilio_whatsapp_number = body.twilio_whatsapp_number?.trim();

  if (!twilio_account_sid || !twilio_whatsapp_number) {
    return NextResponse.json({ error: 'Account SID and WhatsApp number are required' }, { status: 400 });
  }

  const updates: Record<string, any> = {
    twilio_account_sid,
    twilio_whatsapp_number,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the auth token if a new one was actually provided — lets
  // the user update the SID/number without having to re-paste the token.
  if (twilio_auth_token) updates.twilio_auth_token = twilio_auth_token;

  const { error } = await supabaseAdmin.from('tenants').update(updates).eq('id', sessionUser.tenantId);
  if (error) {
    console.error('[Settings/WhatsApp] Failed to save Twilio credentials:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  await supabaseAdmin.from('onboarding_logs').insert({
    tenant_id: sessionUser.tenantId,
    step_name: 'whatsapp_connected',
    step_number: -1, // not part of the numbered onboarding wizard — connected post-setup
    status: 'completed',
    data: { twilio_whatsapp_number },
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
