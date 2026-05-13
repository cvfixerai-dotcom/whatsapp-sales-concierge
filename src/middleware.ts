import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Migrated from deprecated @supabase/auth-helpers-nextjs to @supabase/ssr
// which is the current Supabase recommendation for Next.js App Router.

const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/about',
  '/realestate',
  '/outreach',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/error',
];

const PUBLIC_API_PREFIXES = [
  '/api/webhook/',
  '/api/webhooks/',
  '/api/auth/signup',
  '/api/health',
  '/api/demo/',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Build response — we need to pass it to supabase so it can set cookies
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  // Add pathname to response headers so server components can read it
  res.headers.set('x-pathname', pathname);

  // Always allow public paths without touching session
  if (isPublic(pathname)) return res;

  // Create Supabase client for middleware (handles cookie refresh)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.headers.set('x-pathname', pathname);
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.headers.set('x-pathname', pathname);
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh session (keeps token alive on every request)
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated — redirect to login
  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
