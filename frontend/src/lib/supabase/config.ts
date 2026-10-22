/**
 * Supabase configuration validator and environment reader.
 * Standardized on modern Supabase publishable key convention:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (with backward-compatible NEXT_PUBLIC_SUPABASE_ANON_KEY fallback)
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  /** Backwards compatibility alias for publishableKey */
  anonKey: string;
  isConfigured: boolean;
  missingVariables: string[];
  validationError?: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  // Standardize on publishable key; support legacy anon key as transparent fallback
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const missingVariables: string[] = [];
  if (!url) {
    missingVariables.push('NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!publishableKey) {
    missingVariables.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  let validationError: string | undefined;

  if (missingVariables.length > 0) {
    validationError = `Missing required Supabase environment variable(s): ${missingVariables.join(
      ', '
    )}. Please save them in frontend/.env.local and restart the Next.js server.`;
  } else if (
    !url.startsWith('https://') &&
    !url.startsWith('http://localhost') &&
    !url.startsWith('http://127.0.0.1')
  ) {
    validationError =
      'NEXT_PUBLIC_SUPABASE_URL must be a valid URL starting with https:// (or http:// for local Supabase).';
  } else if (url.includes('your-project-id') || url.includes('placeholder')) {
    validationError =
      'NEXT_PUBLIC_SUPABASE_URL contains placeholder value. Please replace with your actual Supabase project URL.';
  } else if (
    publishableKey.includes('your-') ||
    publishableKey.includes('placeholder')
  ) {
    validationError =
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains placeholder value. Please replace with your actual Supabase publishable key.';
  }

  const isConfigured = !validationError;

  return {
    url,
    publishableKey,
    anonKey: publishableKey,
    isConfigured,
    missingVariables,
    validationError,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().isConfigured;
}

export function getSupabaseConfigError(): string | undefined {
  return getSupabaseConfig().validationError;
}
