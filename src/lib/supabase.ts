import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getStoredUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('custom_supabase_url');
    if (custom) return custom;
  }
  return import.meta.env.VITE_SUPABASE_URL || '';
}

function getStoredAnonKey(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('custom_supabase_anon_key');
    if (custom) return custom;
  }
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
}

let activeClient: SupabaseClient = createClient(
  getStoredUrl() || 'https://placeholder.supabase.co',
  getStoredAnonKey() || 'placeholder'
);

export function getSupabaseConfig() {
  const url = getStoredUrl();
  const anonKey = getStoredAnonKey();
  let projectRef = '';
  try {
    if (url) {
      const parsed = new URL(url);
      projectRef = parsed.hostname.split('.')[0] || '';
    }
  } catch {}
  const isCustom = typeof window !== 'undefined' && Boolean(localStorage.getItem('custom_supabase_url'));
  return { url, anonKey, projectRef, isCustom };
}

export function updateSupabaseConfig(url: string, anonKey: string): SupabaseClient {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  if (typeof window !== 'undefined') {
    localStorage.setItem('custom_supabase_url', cleanUrl);
    localStorage.setItem('custom_supabase_anon_key', cleanKey);
  }
  activeClient = createClient(cleanUrl, cleanKey);
  return activeClient;
}

export function resetSupabaseConfig(): SupabaseClient {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('custom_supabase_url');
    localStorage.removeItem('custom_supabase_anon_key');
  }
  const defaultUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const defaultKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  activeClient = createClient(defaultUrl || 'https://placeholder.supabase.co', defaultKey || 'placeholder');
  return activeClient;
}

// Proxy export so existing imports always point to the active Supabase client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (activeClient as any)[prop];
  }
});
