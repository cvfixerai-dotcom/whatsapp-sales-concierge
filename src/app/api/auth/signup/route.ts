// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { companyName, fullName, email, password } = body;

    // 2. Validate required fields
    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Company name is required' },
        { status: 400 }
      );
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Full name is required' },
        { status: 400 }
      );
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 3. Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // 4. Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Create tenant
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        company_name: companyName.trim(),
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
      console.error('[Signup] Tenant creation error:', tenantError);
      return NextResponse.json(
        {
          success: false,
          error: tenantError?.message || 'Failed to create account. Please try again.',
          code: tenantError?.code,
          details: tenantError?.details,
          hint: tenantError?.hint,
        },
        { status: 500 }
      );
    }

    // 6. Create user
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
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
      console.error('[Signup] User creation error:', userError);
      // Roll back tenant to avoid orphaned records
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { success: false, error: 'Failed to create user account. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`[Signup] New account created: tenant=${tenant.id} user=${user.id} email=${normalizedEmail}`);

    return NextResponse.json(
      { success: true, message: 'Account created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
