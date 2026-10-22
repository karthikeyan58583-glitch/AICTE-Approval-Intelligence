import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/config';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Creates or retrieves the singleton Supabase browser client for client components.
 */
export function createClient() {
  const { url, publishableKey, isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    // Return a dummy client or null-safe fallback when Supabase is not yet configured
    return createBrowserClient(
      url || 'https://placeholder-project.supabase.co',
      publishableKey || 'placeholder-publishable-key'
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
