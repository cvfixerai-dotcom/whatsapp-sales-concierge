import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { createClient } from '@supabase/supabase-js';
import { provisionTenantForUser } from '@/lib/services/provision-tenant';

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

    // Step 2 & 3: Create tenant + public.users row, seed defaults.
    try {
      await provisionTenantForUser({
        authUserId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        companyName: companyName.trim(),
      });
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create account' },
        { status: 500 }
      );
    }

    // No email confirmation link required — if the Supabase project has
    // "Confirm email" disabled, authData.session is already populated and
    // the client below will sign in immediately. The client calls
    // signInWithPassword itself right after this responds 201.
    const requiresEmailConfirmation = !authData.session;

    return NextResponse.json(
      {
        message: requiresEmailConfirmation
          ? 'Account created.'
          : 'Account created and signed in.',
        requiresEmailConfirmation,
      },
      { status: 201 }
    );

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
