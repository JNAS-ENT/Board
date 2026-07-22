import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables for Supabase with fallback options
const env = (import.meta as any).env || {};
const processEnv = typeof process !== 'undefined' ? process.env : {};

const rawUrl = (env.VITE_SUPABASE_URL as string) || (processEnv.VITE_SUPABASE_URL as string) || '';
const rawKey = (env.VITE_SUPABASE_ANON_KEY as string) || (processEnv.VITE_SUPABASE_ANON_KEY as string) || '';

const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  if (
    trimmed === '' ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.toUpperCase().includes('PLACEHOLDER') ||
    trimmed.toUpperCase().includes('YOUR_SUPABASE') ||
    trimmed.toLowerCase().startsWith('your_')
  ) {
    return false;
  }
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
};

const isValidKey = (key: string): boolean => {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    trimmed === '' ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.toUpperCase().includes('PLACEHOLDER') ||
    trimmed.toUpperCase().includes('YOUR_SUPABASE') ||
    trimmed.toLowerCase().startsWith('your_')
  ) {
    return false;
  }
  return trimmed.length > 10;
};

const SUPABASE_URL = isValidUrl(rawUrl) ? rawUrl.trim() : '';
const SUPABASE_ANON_KEY = isValidKey(rawKey) ? rawKey.trim() : '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Cache client instances per workspace credentials to optimize connection pooling and subscription management
const clientCache = new Map<string, SupabaseClient>();

/**
 * Returns a configured Supabase client instance with the workspace authorization headers
 * loaded dynamically into global config to authorize Row Level Security (RLS) policies.
 */
export function getSupabaseClient(workspaceId: string, recoveryKeyHash: string): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  const cacheKey = `${workspaceId}:${recoveryKeyHash}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-workspace-id': workspaceId,
        'x-recovery-key': recoveryKeyHash
      }
    }
  });

  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Get the underlying raw Supabase Client if needed.
 */
export const rawSupabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    })
  : null;
