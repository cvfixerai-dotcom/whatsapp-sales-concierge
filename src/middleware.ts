// @ts-nocheck
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

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
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Add pathname to headers so server components can access it
  res.headers.set('x-pathname', pathname);

  // Always allow public paths without touching session
  if (isPublic(pathname)) return res;

  // Refresh session cookie on every request (keeps token alive)
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Unauthenticated — redirect to login
  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
