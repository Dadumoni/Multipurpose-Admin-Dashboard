import mongoose from 'mongoose';
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = 'videos_db';

interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: CachedConnection | undefined;
}

let cached: CachedConnection = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    } catch {}
    const opts = {
      bufferCommands: false,
      dbName: MONGODB_DB_NAME,
    };

    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then(async (mongooseInstance) => {
      // Connect to MongoDB database 'videos_db' and primary collection 'posts'
      try {
        const db = mongooseInstance.connection.db;
        if (db) {
          const count = await db.collection('posts').countDocuments();
          console.log(`[MongoDB] Successfully connected to database "${MONGODB_DB_NAME}". Collection "posts" has ${count.toLocaleString()} documents.`);
          db.collection('posts').createIndex({ scraped_at: -1 }, { background: true }).catch(() => {});
          db.collection('posts').createIndex({ domain: 1, scraped_at: -1 }, { background: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('[MongoDB] Collection check notice:', err);
      }
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export interface IPost {
  id?: number;
  title: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  created_at?: Date;
  updated_at?: number | Date | null;
  views?: number;
  video_url1?: string | null;
  video_url2?: string | null;
  // Document structure fields
  post_url?: string | null;
  video_id?: string | null;
  scraped_at?: number | Date | null;
  '480p_link'?: string | null;
  '720p_link'?: string | null;
  all_links?: string[];
  domain?: string | null;
  duration?: string | null;
  synced_at?: Date;
  is_expired?: boolean;
  expired_checked_at?: Date | null;
  source?: 'dashboard' | 'telegram' | string;
  file_id?: string | null;
  metadata?: any;
}

const PostSchema = new mongoose.Schema<IPost>(
  {
    id: { type: Number, index: true },
    title: { type: String, required: true },
    video_url: { type: String, default: null },
    thumbnail_url: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: mongoose.Schema.Types.Mixed, default: null },
    views: { type: Number, default: 0 },
    video_url1: { type: String, default: null },
    video_url2: { type: String, default: null },
    // Document structure fields
    post_url: { type: String, default: null, index: true },
    video_id: { type: String, default: null, index: true },
    scraped_at: { type: mongoose.Schema.Types.Mixed, default: null },
    '480p_link': { type: String, default: null },
    '720p_link': { type: String, default: null },
    all_links: { type: [String], default: [] },
    domain: { type: String, default: null, index: true },
    duration: { type: String, default: null },
    synced_at: { type: Date, default: Date.now },
    is_expired: { type: Boolean, default: false, index: true },
    expired_checked_at: { type: Date, default: null },
    source: { type: String, default: 'dashboard', index: true },
    file_id: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: false,
    collection: 'posts',
    strict: false,
  }
);

PostSchema.index({ created_at: -1 });
PostSchema.index({ views: -1 });
PostSchema.index({ scraped_at: -1 });
PostSchema.index({ domain: 1, scraped_at: -1 });

export const PostModel = mongoose.models.Post || mongoose.model<IPost>('Post', PostSchema, 'posts');

export interface IUploadedVideo {
  id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  views: number;
  file_size?: string | null;
  duration?: string | null;
  upload_type: 'upload' | 'link';
  source?: 'dashboard' | 'telegram' | string;
  file_id?: string | null;
  metadata?: any;
  created_at: Date;
}

const UploadedVideoSchema = new mongoose.Schema<IUploadedVideo>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    video_url: { type: String, required: true },
    thumbnail_url: { type: String, default: null },
    views: { type: Number, default: 0 },
    file_size: { type: String, default: null },
    duration: { type: String, default: null },
    upload_type: { type: String, enum: ['upload', 'link'], default: 'upload' },
    source: { type: String, default: 'dashboard', index: true },
    file_id: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'uploaded_videos',
  }
);

UploadedVideoSchema.index({ created_at: -1 });

export const UploadedVideoModel =
  mongoose.models.UploadedVideo || mongoose.model<IUploadedVideo>('UploadedVideo', UploadedVideoSchema);

export interface IVisitor {
  id?: string;
  ip?: string;
  device?: string; // Android, iOS, Windows, macOS, Linux
  browser?: string; // Chrome, Safari, Firefox, Edge
  country?: string; // United States, United Kingdom, Germany, etc.
  country_code?: string;
  visited_at?: Date;
  created_at?: Date;
}

const VisitorSchema = new mongoose.Schema<IVisitor>(
  {
    id: { type: String },
    ip: { type: String, default: null },
    device: { type: String, default: 'Desktop' },
    browser: { type: String, default: 'Chrome' },
    country: { type: String, default: 'United States' },
    country_code: { type: String, default: 'US' },
    visited_at: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'visitors',
  }
);

VisitorSchema.index({ visited_at: -1 });
VisitorSchema.index({ created_at: -1 });

export const VisitorModel =
  mongoose.models.Visitor || mongoose.model<IVisitor>('Visitor', VisitorSchema);



export interface ITrackedFile {
  id: string;
  file_hash: string;
  file_name: string;
  file_size?: number | string | null;
  mime_type?: string | null;
  source: 'dashboard' | 'telegram' | string;
  telegram_file_id?: string | null;
  telegram_file_unique_id?: string | null;
  zerostorage_file_id?: string | null;
  zerostorage_download_url?: string | null;
  zerostorage_embed_url?: string | null;
  title: string;
  thumbnail_url?: string | null;
  created_at: Date;
}

const TrackedFileSchema = new mongoose.Schema<ITrackedFile>(
  {
    id: { type: String, required: true, unique: true, index: true },
    file_hash: { type: String, index: true },
    file_name: { type: String, required: true },
    file_size: { type: mongoose.Schema.Types.Mixed, default: null },
    mime_type: { type: String, default: null },
    source: { type: String, default: 'dashboard', index: true },
    telegram_file_id: { type: String, default: null, index: true },
    telegram_file_unique_id: { type: String, default: null, index: true },
    zerostorage_file_id: { type: String, default: null, index: true },
    zerostorage_download_url: { type: String, default: null },
    zerostorage_embed_url: { type: String, default: null },
    title: { type: String, required: true },
    thumbnail_url: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'tracked_files',
  }
);

TrackedFileSchema.index({ created_at: -1 });

export const TrackedFileModel =
  mongoose.models.TrackedFile || mongoose.model<ITrackedFile>('TrackedFile', TrackedFileSchema);


export interface ISyncSettings {
  key: string;
  sync_enabled: boolean;
  updated_at: Date;
}

const SyncSettingsSchema = new mongoose.Schema<ISyncSettings>(
  {
    key: { type: String, required: true, unique: true, index: true },
    sync_enabled: { type: Boolean, default: true },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'sync_settings',
  }
);

export const SyncSettingsModel =
  mongoose.models.SyncSettings ||
  mongoose.model<ISyncSettings>('SyncSettings', SyncSettingsSchema);

export interface IDomainSource {
  domain: string;
  count: number;
  percentage: number;
  totalViews: number;
}

export interface IDashboardStats {
  id: string; // 'global_stats'
  total_posts: number;
  total_uploaded: number;
  total_videos: number;
  total_views: number;
  video_sources: IDomainSource[];
  recent_posts?: any[];
  last_scraped_at?: Date | null;
  updated_at: Date;
}

const DomainSourceSchema = new mongoose.Schema<IDomainSource>(
  {
    domain: { type: String, required: true },
    count: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
  },
  { _id: false }
);

const DashboardStatsSchema = new mongoose.Schema<IDashboardStats>(
  {
    id: { type: String, required: true, unique: true, default: 'global_stats' },
    total_posts: { type: Number, default: 0 },
    total_uploaded: { type: Number, default: 0 },
    total_videos: { type: Number, default: 0 },
    total_views: { type: Number, default: 0 },
    video_sources: { type: [DomainSourceSchema], default: [] },
    recent_posts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    last_scraped_at: { type: Date, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'dashboard_stats',
  }
);

export const DashboardStatsModel =
  mongoose.models.DashboardStats ||
  mongoose.model<IDashboardStats>('DashboardStats', DashboardStatsSchema);

export interface ITelegramBotChannel {
  chat_id: number | string;
  channel_name: string;
  total_posts: number;
  success_posts: number;
  failed_posts: number;
  is_active: boolean;
  posted_ids: (number | string)[];
  added_at: Date;
}

const TelegramBotChannelSchema = new mongoose.Schema<ITelegramBotChannel>(
  {
    chat_id: { type: mongoose.Schema.Types.Mixed, required: true, unique: true, index: true },
    channel_name: { type: String, default: 'Telegram Channel' },
    total_posts: { type: Number, default: 0 },
    success_posts: { type: Number, default: 0 },
    failed_posts: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    posted_ids: { type: [mongoose.Schema.Types.Mixed], default: [] },
    added_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'telegram_bot_channels',
  }
);

export const TelegramBotChannelModel =
  mongoose.models.TelegramBotChannel ||
  mongoose.model<ITelegramBotChannel>('TelegramBotChannel', TelegramBotChannelSchema);

export interface ITelegramBotState {
  id: string; // 'status'
  is_running: boolean;
  stopped: boolean;
  bot_name: string;
  bot_username: string;
  last_started_at: Date | null;
  last_stopped_at: Date | null;
  updated_at: Date;
}

const TelegramBotStateSchema = new mongoose.Schema<ITelegramBotState>(
  {
    id: { type: String, required: true, unique: true, default: 'status' },
    is_running: { type: Boolean, default: false },
    stopped: { type: Boolean, default: true },
    bot_name: { type: String, default: 'Poster Bot' },
    bot_username: { type: String, default: '' },
    last_started_at: { type: Date, default: null },
    last_stopped_at: { type: Date, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'telegram_bot_state',
  }
);

export const TelegramBotStateModel =
  mongoose.models.TelegramBotState ||
  mongoose.model<ITelegramBotState>('TelegramBotState', TelegramBotStateSchema);

export interface ITelegramBotSettings {
  id: string; // 'custom_text'
  text: string;
  updated_at: Date;
}

const TelegramBotSettingsSchema = new mongoose.Schema<ITelegramBotSettings>(
  {
    id: { type: String, required: true, unique: true, default: 'custom_text' },
    text: { type: String, default: '' },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'telegram_bot_settings',
  }
);

export const TelegramBotSettingsModel =
  mongoose.models.TelegramBotSettings ||
  mongoose.model<ITelegramBotSettings>('TelegramBotSettings', TelegramBotSettingsSchema);

export interface IScraperSite {
  site_id: string; // 'lalamasa'
  name: string; // 'lalamasa.mobi'
  domain: string; // 'lalamasa.mobi'
  base_url: string; // 'https://lalamasa.mobi'
  cron_schedule: string; // 'Daily at 00:00'
  enabled: boolean;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  total_scraped: number;
  failed_count: number;
  last_new_posts?: number;
  last_run_at?: Date | null;
  last_run_type?: string | null;
  next_run_at?: Date | null;
  last_error?: string | null;
  updated_at?: Date;
}

const ScraperSiteSchema = new mongoose.Schema<IScraperSite>(
  {
    site_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    domain: { type: String, required: true },
    base_url: { type: String, required: true },
    cron_schedule: { type: String, default: 'Daily at 00:00' },
    enabled: { type: Boolean, default: true },
    status: { type: String, default: 'idle' },
    total_scraped: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },
    last_new_posts: { type: Number, default: 0 },
    last_run_at: { type: Date, default: null },
    last_run_type: { type: String, default: 'scheduled' },
    next_run_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'scraper_sites',
  }
);

export const ScraperSiteModel =
  mongoose.models.ScraperSite ||
  mongoose.model<IScraperSite>('ScraperSite', ScraperSiteSchema);


