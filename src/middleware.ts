import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Public API routes that don't require authentication (webhooks, etc.)
const PUBLIC_API_ROUTES = [
  '/api/webhook/',
  '/api/webhooks/',
  '/api/auth/',
  '/api/health',
  '/api/demo/',
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));
}

export default withAuth(
  function middleware(req) {
    // Get token from request
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Allow access to auth pages
    if (pathname.startsWith('/auth/')) {
      return NextResponse.next();
    }

    // Allow public API routes (webhooks)
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }

    // Protect dashboard routes
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/')) {
      if (!token) {
        return NextResponse.redirect(new URL('/auth/login', req.url));
      }
    }

    // Redirect authenticated users away from login
    if (pathname === '/auth/login' && token) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        
        // Public routes that don't require authentication
        if (pathname === '/' || pathname === '/pricing' || pathname === '/about' || pathname === '/realestate') {
          return true;
        }

        // Onboarding route requires authentication but is allowed
        if (pathname === '/onboarding') {
          return !!token;
        }

        // Auth routes
        if (pathname.startsWith('/auth/')) {
          return true;
        }

        // Public API routes (webhooks)
        if (isPublicApiRoute(pathname)) {
          return true;
        }

        // All other routes require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
