import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables for Supabase
const env = (import.meta as any).env || {};
const SUPABASE_URL = (env.VITE_SUPABASE_URL as string) || '';
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string) || '';

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
