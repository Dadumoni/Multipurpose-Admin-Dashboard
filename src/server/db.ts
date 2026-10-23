import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabaseClient: SupabaseClient | null = null;

/**
 * Returns cached Supabase client using environment variables.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_supabaseClient) return _supabaseClient;
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  _supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return _supabaseClient;
}

export const getSupabaseBackupClient = getSupabaseClient;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');
    return (client as any)[prop];
  }
});

export interface ISupabaseDashboardStats {
  id: string;
  total_videos: number;
  total_views: number;
  missing_thumbnail: number;
  telegram_upload: number;
  total_r2_videos: number;
  total_telegram_videos: number;
  video_source: number;
  video_sources?: any[];
  updated_at: string;
}

/**
 * Instant O(1) read from Supabase 'dashboard_stats' table.
 * Maintained automatically via PostgreSQL triggers on viralhub_db, all_videos_db, telegram_uploaded, and visitor_views.
 * Never requires full table scans.
 */
export async function getSupabaseDashboardStats(): Promise<ISupabaseDashboardStats | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('dashboard_stats')
      .select('*')
      .eq('id', 'global_stats')
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        total_videos: Number(data.total_videos) || 0,
        total_views: Number(data.total_views) || 0,
        missing_thumbnail: Number(data.missing_thumbnail) || 0,
        telegram_upload: Number(data.telegram_upload) || Number(data.total_telegram_videos) || 0,
        total_r2_videos: Number(data.total_r2_videos) || 0,
        total_telegram_videos: Number(data.total_telegram_videos) || Number(data.telegram_upload) || 0,
        video_source: Number(data.video_source) || 11,
        video_sources: Array.isArray(data.video_sources) ? data.video_sources : [],
        updated_at: data.updated_at || new Date().toISOString(),
      };
    }
  } catch (err: any) {
    console.warn('[Supabase Stats] Failed to fetch dashboard_stats row:', err.message);
  }
  return null;
}
