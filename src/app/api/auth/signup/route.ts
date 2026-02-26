// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/db/client';
import { createClient } from '@supabase/supabase-js';

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { companyName, fullName, email, password } = body;

    if (!companyName?.trim()) return NextResponse.json({ success: false, error: 'Company name is required' }, { status: 400 });
    if (!fullName?.trim()) return NextResponse.json({ success: false, error: 'Full name is required' }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      console.error('[Signup] Auth error:', authError);
      const msg = authError?.message || 'Failed to create auth account';
      const status = msg.toLowerCase().includes('already') ? 409 : 500;
      return NextResponse.json({ success: false, error: msg }, { status });
    }

    const authUserId = authData.user.id;

    // Step 2: Hash password for NextAuth credentials provider
    const passwordHash = await bcrypt.hash(password, 12);

    // Step 3: Create tenant linked to Supabase Auth user
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        company_name: companyName.trim(),
        owner_id: authUserId,
        subscription_tier: 'starter',
        subscription_status: 'trial',
        trial_start_date: trialStart.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        trial_conversation_limit: 25,
        monthly_conversation_limit: 500,
        ai_provider: 'anthropic',
        ai_model: 'claude-3-5-sonnet-20241022',
        business_hours: {},
        setup_completed: false,
      })
      .select('id')
      .single();

    if (tenantError || !tenant) {
      console.error('[Signup] Tenant error:', tenantError);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ success: false, error: tenantError?.message || 'Failed to create tenant' }, { status: 500 });
    }

    // Step 4: Create custom users row — id matches Supabase Auth UID so NextAuth can find it
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        tenant_id: tenant.id,
        email: normalizedEmail,
        password_hash: passwordHash,
        full_name: fullName.trim(),
        role: 'owner',
        is_active: true,
      })
      .select('id')
      .single();

    if (userError || !user) {
      console.error('[Signup] User row error:', userError);
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ success: false, error: 'Failed to create user record' }, { status: 500 });
    }

    console.log(`[Signup] Created: auth=${authUserId} tenant=${tenant.id} email=${normalizedEmail}`);
    return NextResponse.json({ success: true, message: 'Account created successfully' }, { status: 201 });

  } catch (error) {
    console.error('[Signup] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
