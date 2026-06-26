import { createBrowserClient } from '@supabase/ssr';

// Uses @supabase/ssr (matches middleware.ts and supabase-server.ts).
// The deprecated @supabase/auth-helpers-nextjs client used to live here —
// it sets cookies in a format the @supabase/ssr-based middleware can't
// read, so a successful client-side sign-in would silently fail to
// authenticate against the server (middleware would bounce back to
// /auth/login with no visible error).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
