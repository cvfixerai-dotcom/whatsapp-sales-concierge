import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/db/client';

// Next.js 15: cookies() is async and must be awaited.
// Migrated from deprecated @supabase/auth-helpers-nextjs to @supabase/ssr.

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

/**
 * Shared session helper for API routes and server components.
 * Returns { userId, tenantId } or null if unauthenticated.
 */
export async function getSessionUser(): Promise<{ userId: string; tenantId: string } | null> {
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRow?.tenant_id) return null;

  return { userId: user.id, tenantId: userRow.tenant_id };
}
