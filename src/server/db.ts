import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  connectToDatabase,
  PostModel,
  UploadedVideoModel,
  TrackedFileModel,
  SyncSettingsModel,
  DashboardStatsModel,
  TelegramBotChannelModel,
  IPost,
  IUploadedVideo,
  ITrackedFile,
  ISyncSettings,
  IDashboardStats,
  ITelegramBotChannel,
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
 * Maintained automatically via PostgreSQL triggers on viralhub_db and all_videos_db.
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
 * Contains lightweight total_videos and total_posts count without scanning collection.
 */
export async function getMongoDashboardStats(): Promise<{ total_videos: number; total_posts: number; total_uploaded: number; total_views: number }> {
  try {
    await connectToDatabase();
    const doc = await DashboardStatsModel.findOne({ id: 'global_stats' }).lean();
    if (doc) {
      return {
        total_videos: doc.total_videos || doc.total_posts || 0,
        total_posts: doc.total_posts || doc.total_videos || 0,
        total_uploaded: doc.total_uploaded || 0,
        total_views: doc.total_views || 0,
      };
    }

    // If doc not initialized yet, compute once and save
    const count = await PostModel.countDocuments();
    await DashboardStatsModel.updateOne(
      { id: 'global_stats' },
      { $set: { total_videos: count, total_posts: count, updated_at: new Date() } },
      { upsert: true }
    );
    return {
      total_videos: count,
      total_posts: count,
      total_uploaded: 0,
      total_views: 0,
    };
  } catch (err: any) {
    console.warn('[MongoDB Stats] Failed to fetch dashboard_stats doc:', err.message);
    return { total_videos: 0, total_posts: 0, total_uploaded: 0, total_views: 0 };
  }
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
};

export type {
  IPost,
  IUploadedVideo,
  ITrackedFile,
  ISyncSettings,
  IDashboardStats,
  ITelegramBotChannel,
};
