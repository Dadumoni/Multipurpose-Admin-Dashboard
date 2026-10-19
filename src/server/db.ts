import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  connectToDatabase,
  PostModel,
  UploadedVideoModel,
  TrackedFileModel,
  SyncSettingsModel,
  DashboardStatsModel,
  TelegramBotChannelModel,
  ScraperSiteModel,
  IPost,
  IUploadedVideo,
  ITrackedFile,
  ISyncSettings,
  IDashboardStats,
  ITelegramBotChannel,
  IScraperSite,
} from '../lib/mongodb.js';

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

export interface ISupabaseDashboardStats {
  id: string;
  total_videos: number;
  total_views: number;
  missing_thumbnail: number;
  telegram_upload: number;
  video_source: number;
  updated_at: string;
}

/**
 * Instant O(1) read from Supabase 'dashboard_stats' table.
 * Maintained automatically via PostgreSQL triggers on viralhub_db and visitor_views.
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
        telegram_upload: Number(data.telegram_upload) || 0,
        video_source: Number(data.video_source) || 11,
        updated_at: data.updated_at || new Date().toISOString(),
      };
    }
  } catch (err: any) {
    console.warn('[Supabase Stats] Failed to fetch dashboard_stats row:', err.message);
  }
  return null;
}

/**
 * Instant O(1) read from MongoDB 'dashboard_stats' collection.
 */
export interface IMongoDashboardStats {
  total_videos: number;
  total_posts: number;
  total_uploaded: number;
  total_views: number;
  total_post_scraped?: number;
  failed_extractions?: number;
  sites_scraped?: Record<string, number>;
}

export async function getMongoDashboardStats(): Promise<IMongoDashboardStats> {
  try {
    await connectToDatabase();
    const doc = await DashboardStatsModel.findOne({ id: 'global_stats' }).lean();
    if (doc) {
      return {
        total_videos: doc.total_videos || doc.total_posts || 0,
        total_posts: doc.total_posts || doc.total_videos || 0,
        total_uploaded: doc.total_uploaded || 0,
        total_views: doc.total_views || 0,
        total_post_scraped: doc.total_post_scraped || doc.total_posts || 0,
        failed_extractions: doc.failed_extractions || 0,
        sites_scraped: doc.sites_scraped || {},
      };
    }

    // If doc not initialized yet, compute once and save
    const { recalculateStats } = await import('./statsManager.js');
    const fresh = await recalculateStats();
    return {
      total_videos: fresh?.total_videos || 0,
      total_posts: fresh?.total_posts || 0,
      total_uploaded: fresh?.total_uploaded || 0,
      total_views: fresh?.total_views || 0,
      total_post_scraped: fresh?.total_post_scraped || fresh?.total_posts || 0,
      failed_extractions: fresh?.failed_extractions || 0,
      sites_scraped: fresh?.sites_scraped || {},
    };
  } catch (err: any) {
    console.warn('[MongoDB Stats] Failed to fetch dashboard_stats doc:', err.message);
    return { total_videos: 0, total_posts: 0, total_uploaded: 0, total_views: 0, total_post_scraped: 0, failed_extractions: 0, sites_scraped: {} };
  }
}

/**
 * Instant O(1) read for scraper cards and site cards directly from dashboard_stats
 */
export async function getScraperDashboardStats(): Promise<{ total_post_scraped: number; failed_extractions: number; sites_scraped: Record<string, number> }> {
  const stats = await getMongoDashboardStats();
  return {
    total_post_scraped: stats.total_post_scraped || 0,
    failed_extractions: stats.failed_extractions || 0,
    sites_scraped: stats.sites_scraped || {},
  };
}

/**
 * Increment or decrement MongoDB total_videos count in dashboard_stats.
 */
export async function adjustMongoTotalVideos(delta: number) {
  try {
    await connectToDatabase();
    await DashboardStatsModel.updateOne(
      { id: 'global_stats' },
      {
        $inc: { total_videos: delta, total_posts: delta },
        $set: { updated_at: new Date() }
      },
      { upsert: true }
    );
  } catch (err: any) {
    console.warn('[MongoDB Stats] Failed to adjust total_videos:', err.message);
  }
}

// Re-export MongoDB utilities
export {
  connectToDatabase,
  PostModel,
  UploadedVideoModel,
  TrackedFileModel,
  SyncSettingsModel,
  DashboardStatsModel,
  TelegramBotChannelModel,
  ScraperSiteModel,
};

export type {
  IPost,
  IUploadedVideo,
  ITrackedFile,
  ISyncSettings,
  IDashboardStats,
  ITelegramBotChannel,
  IScraperSite,
};
