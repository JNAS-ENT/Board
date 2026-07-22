import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables for Supabase with fallback options
const env = (import.meta as any).env || {};
const processEnv = typeof process !== 'undefined' ? process.env : {};

let dynamicSupabaseUrl = (env.VITE_SUPABASE_URL as string) || (processEnv.VITE_SUPABASE_URL as string) || '';
let dynamicSupabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string) || (processEnv.VITE_SUPABASE_ANON_KEY as string) || '';

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

// Check if static build-time config is valid
let activeUrl = isValidUrl(dynamicSupabaseUrl) ? dynamicSupabaseUrl.trim() : '';
let activeKey = isValidKey(dynamicSupabaseAnonKey) ? dynamicSupabaseAnonKey.trim() : '';

export function isSupabaseConfigured(): boolean {
  return Boolean(activeUrl && activeKey);
}

// Cache client instances per workspace credentials to optimize connection pooling and subscription management
const clientCache = new Map<string, SupabaseClient>();

// Update configuration dynamically at runtime
export function configureSupabase(url: string, key: string): boolean {
  if (isValidUrl(url) && isValidKey(key)) {
    activeUrl = url.trim();
    activeKey = key.trim();
    
    // Clear cache to recreate clients with the new URL/key
    clientCache.clear();
    
    // Recreate rawSupabase
    rawSupabase = createClient(activeUrl, activeKey, {
      auth: { persistSession: false }
    });
    
    console.log('[Supabase Client] Dynamic configuration loaded successfully.');
    return true;
  }
  return false;
}

/**
 * Returns a configured Supabase client instance with the workspace authorization headers
 * loaded dynamically into global config to authorize Row Level Security (RLS) policies.
 */
export function getSupabaseClient(workspaceId: string, recoveryKeyHash: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const cacheKey = `${workspaceId}:${recoveryKeyHash}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const client = createClient(activeUrl, activeKey, {
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
export let rawSupabase: SupabaseClient | null = null;

// Initialize rawSupabase dynamically on startup if configured
if (isSupabaseConfigured()) {
  rawSupabase = createClient(activeUrl, activeKey, {
    auth: { persistSession: false }
  });
}
