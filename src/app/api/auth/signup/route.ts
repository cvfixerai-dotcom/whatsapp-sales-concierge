// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { createClient } from '@supabase/supabase-js';

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { companyName, fullName, email, password } = body;

    if (!companyName?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    if (!fullName?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Create Supabase Auth user
    // emailRedirectTo sends the user to /auth/callback?code=... which exchanges the code for a session
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://concierge.fixeraitech.com'}/auth/callback`,
        data: { full_name: fullName.trim(), company_name: companyName.trim() },
      },
    });

    if (authError || !authData.user) {
      const msg = authError?.message ?? 'Failed to create account';
      const status = msg.toLowerCase().includes('already') ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    const authUserId = authData.user.id;

    // Step 2: Create tenant
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        company_name: companyName.trim(),
        owner_id: authUserId,
        subscription_tier: 'trial',
        subscription_status: 'trial',
        trial_start_date: trialStart.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        trial_conversation_limit: 25,
        monthly_conversation_limit: 25,
        ai_provider: 'anthropic',
        ai_model: 'claude-sonnet-4-20250514',
        business_hours: {},
        setup_completed: false,
      })
      .select('id')
      .single();

    if (tenantError || !tenant) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: tenantError?.message ?? 'Failed to create tenant' }, { status: 500 });
    }

    // Step 3: Create public.users row (id = auth uid)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        tenant_id: tenant.id,
        email: normalizedEmail,
        password_hash: '',
        full_name: fullName.trim(),
        role: 'owner',
        is_active: true,
      });

    if (userError) {
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
    }

    console.log(`[Signup] Created: auth=${authUserId} tenant=${tenant.id} email=${normalizedEmail}`);
    return NextResponse.json({ message: 'Check your email to confirm your account.' }, { status: 201 });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
