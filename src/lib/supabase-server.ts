import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/db/client';

export function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerComponentClient({ cookies: () => cookieStore });
}

/**
 * Shared session helper for API routes and server components.
 * Replaces the old getServerSession(authOptions) + session.user.tenantId pattern.
 *
 * Returns { userId, tenantId } or null if unauthenticated.
 */
export async function getSessionUser(): Promise<{ userId: string; tenantId: string } | null> {
  const supabase = getSupabaseServer();
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
