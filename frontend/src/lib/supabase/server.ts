import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from '@/lib/supabase/config';

/**
 * Creates a server-side Supabase client for Server Components, Actions, and Route Handlers.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey, isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    return createServerClient(
      url || 'https://placeholder-project.supabase.co',
      publishableKey || 'placeholder-publishable-key',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Can be safely ignored if called from a Server Component where headers are read-only
        }
      },
    },
  });
}
