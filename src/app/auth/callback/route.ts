import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { findExistingTenantId, provisionTenantForUser } from '@/lib/services/provision-tenant';

// Next.js 15: cookies() is async and must be awaited.
// Also migrated from deprecated @supabase/auth-helpers-nextjs to @supabase/ssr.
//
// Handles both:
//  - Email confirmation links (password signup flow)
//  - Google OAuth redirects (signInWithOAuth) — first-time Google
//    sign-ins land here with no tenant yet, so we provision one on the
//    fly before sending them on to onboarding.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      try {
        const existingTenantId = await findExistingTenantId(data.user.id);
        if (!existingTenantId) {
          // First time we've seen this auth user (typically a brand new
          // Google sign-in) — provision a tenant now and send them to
          // onboarding regardless of what `next` said.
          const meta = data.user.user_metadata ?? {};
          await provisionTenantForUser({
            authUserId: data.user.id,
            email: data.user.email ?? '',
            fullName: meta.full_name ?? meta.name ?? (data.user.email?.split('@')[0] ?? 'there'),
            companyName: meta.company_name ?? 'My Business',
          });
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      } catch (provisionError) {
        console.error('[Auth Callback] Tenant provisioning failed:', provisionError);
        return NextResponse.redirect(`${origin}/auth/login?error=provisioning_failed`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] Code exchange failed:', error?.message);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`);
}
