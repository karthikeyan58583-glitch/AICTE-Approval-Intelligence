import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { isRouteAllowedForRole } from '@/lib/auth/roles';
import { AppRole } from '@/types/auth';

/**
 * Updates the user session and enforces authentication & authorization policies.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { url, publishableKey, isConfigured } = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;

  // Publicly accessible paths that do not require authentication
  const isPublicAuthPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/confirm-email') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/access-denied');

  // If Supabase is not configured yet (initial repository clone), allow public setup views
  if (!isConfigured) {
    if (!isPublicAuthPath) {
      // Redirect to login where configuration setup instructions are displayed
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('reason', 'setup_required');
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verify user identity securely with Supabase Auth
  // IMPORTANT: We use getUser() instead of getSession() to ensure cryptographic verification
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is NOT signed in and attempting to access a protected application route
  if (!user && !isPublicAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If user IS signed in and attempts to access login or register, redirect them to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  // Role-based route authorization check for authenticated users on protected paths
  if (user && !isPublicAuthPath) {
    try {
      // Query trusted user profile for assigned role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // Default to applicant role if profile record is still provisioning
      const userRole: AppRole = profile?.role || 'applicant_institution_representative';

      // Check if current route is allowed for the user's role
      if (!isRouteAllowedForRole(pathname, userRole)) {
        const deniedUrl = request.nextUrl.clone();
        deniedUrl.pathname = '/access-denied';
        deniedUrl.searchParams.set('path', pathname);
        deniedUrl.searchParams.set('role', userRole);
        return NextResponse.redirect(deniedUrl);
      }
    } catch {
      // In case of transient database connection error, deny access to privileged routes
      if (pathname === '/admin' || pathname === '/bottlenecks' || pathname === '/compliance') {
        const deniedUrl = request.nextUrl.clone();
        deniedUrl.pathname = '/access-denied';
        return NextResponse.redirect(deniedUrl);
      }
    }
  }

  return response;
}
