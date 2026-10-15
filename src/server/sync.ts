import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';
import dns from 'node:dns';
import { connectToDatabase, PostModel, SyncSettingsModel } from '../lib/mongodb.js';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

const MONGO_DB_NAME = 'videos_db';
const MONGO_COLLECTION_NAME = 'posts';
const SUPABASE_TABLE_NAME = 'viralhub_db';

function slugifyText(text: string): string {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a clean, unique slug combining Title and Video ID.
 */
export function generateSafeSlug(doc: Record<string, any>): string {
  const title = doc.title || '';
  const videoId = doc.video_id || '';
  const combinedText = videoId ? `${title}-${videoId}` : String(title);
  return slugifyText(combinedText);
}

function parseToUnixSeconds(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    return val > 1e11 ? val / 1000 : val;
  }
  if (val instanceof Date) {
    return val.getTime() / 1000;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num)) {
      return num > 1e11 ? num / 1000 : num;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.getTime() / 1000;
    }
  }
  return null;
}

function parseToUnixMs(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num)) return num;
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

export interface MigrationProgress {
  inProgress: boolean;
  totalDocs: number;
  processedDocs: number;
  existingCount: number;
  successCount: number;
  errorCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

const migrationProgress: MigrationProgress = {
  inProgress: false,
  totalDocs: 0,
  processedDocs: 0,
  existingCount: 0,
  successCount: 0,
  errorCount: 0,
  startedAt: null,
  finishedAt: null,
  lastError: null,
};

export function isMigrationRunning(): boolean {
  return migrationProgress.inProgress;
}

export function getMigrationProgress(): MigrationProgress {
  return { ...migrationProgress };
}

/**
 * Native Node.js / TypeScript background migration from MongoDB (videos_db.posts)
 * to Supabase (viralhub_db).
 * INCREMENTAL SYNC: First checks all existing records in Supabase (id, video_id, post_url),
 * skips them completely, and only copies new/missing data in batches of 50.
 */
export async function migrateMongoToSupabase(): Promise<{
  totalProcessed: number;
  alreadyExisting: number;
  successCount: number;
  errorCount: number;
}> {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

  if (!mongoUri || !supabaseUrl || !supabaseKey) {
    const errMsg = 'Error: Missing credentials in .env file! Please verify your environment configuration.';
    migrationProgress.lastError = errMsg;
    console.error(`[Error] ${errMsg}`);
    throw new Error(errMsg);
  }

  if (migrationProgress.inProgress) {
    console.log('[DB Sync] Migration is already running in the background.');
    return {
      totalProcessed: migrationProgress.processedDocs,
      alreadyExisting: migrationProgress.existingCount,
      successCount: migrationProgress.successCount,
      errorCount: migrationProgress.errorCount,
    };
  }

  migrationProgress.inProgress = true;
  migrationProgress.totalDocs = 0;
  migrationProgress.processedDocs = 0;
  migrationProgress.existingCount = 0;
  migrationProgress.successCount = 0;
  migrationProgress.errorCount = 0;
  migrationProgress.startedAt = new Date().toISOString();
  migrationProgress.finishedAt = null;
  migrationProgress.lastError = null;

  let mongoClient: MongoClient | null = null;

  try {
    console.log(`[DB Sync] Starting incremental MongoDB → Supabase (${SUPABASE_TABLE_NAME}) synchronization...`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch all existing IDs, video_ids, and post_urls from Supabase viralhub_db
    console.log(`[DB Sync] Checking existing records in Supabase (${SUPABASE_TABLE_NAME})...`);
    const existingIds = new Set<string>();
    const existingVideoIds = new Set<string>();
    const existingPostUrls = new Set<string>();

    let from = 0;
    const FETCH_CHUNK = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE_NAME)
        .select('id, video_id, post_url')
        .range(from, from + FETCH_CHUNK - 1);

      if (error) {
        console.error(`[DB Sync] Error querying Supabase ${SUPABASE_TABLE_NAME}:`, error.message);
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const row of data) {
        if (row.id) existingIds.add(String(row.id));
        if (row.video_id) existingVideoIds.add(String(row.video_id));
        if (row.post_url) existingPostUrls.add(String(row.post_url));
      }

      if (data.length < FETCH_CHUNK) {
        hasMore = false;
      } else {
        from += FETCH_CHUNK;
      }
    }

    const existingCount = existingIds.size;
    migrationProgress.existingCount = existingCount;
    console.log(`[DB Sync] Found ${existingCount.toLocaleString()} existing records in Supabase (${SUPABASE_TABLE_NAME}).`);

    // 2. Connect to MongoDB and scan documents
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const collection = mongoClient.db(MONGO_DB_NAME).collection(MONGO_COLLECTION_NAME);

    const totalMongoDocs = await collection.countDocuments();
    migrationProgress.totalDocs = totalMongoDocs;
    console.log(`[DB Sync] Total ${totalMongoDocs.toLocaleString()} documents found in MongoDB (${MONGO_DB_NAME}.${MONGO_COLLECTION_NAME}).`);

    // Stream MongoDB documents through cursor to keep memory footprint minimal (<15MB)
    const cursor = collection.find({}).batchSize(500);

    let skippedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const pendingBatch: any[] = [];
    const BATCH_SIZE = 50;

    const commitBatch = async (batch: any[]) => {
      if (batch.length === 0) return;
      try {
        const { error } = await supabase.from(SUPABASE_TABLE_NAME).upsert(batch, { onConflict: 'id' });
        if (error) {
          console.warn(`[DB Sync] Batch upsert warning (${error.message}). Retrying row-by-row...`);
          // Row-by-row fallback
          for (const item of batch) {
            try {
              const { error: rowErr } = await supabase.from(SUPABASE_TABLE_NAME).upsert([item], { onConflict: 'id' });
              if (rowErr) throw new Error(rowErr.message);
              successCount++;
              existingIds.add(item.id);
              if (item.video_id) existingVideoIds.add(item.video_id);
              if (item.post_url) existingPostUrls.add(item.post_url);
            } catch (singleErr: any) {
              errorCount++;
              migrationProgress.lastError = singleErr.message || String(singleErr);
              console.error(`[Error] Failed to migrate doc ID ${item.id}:`, singleErr.message || singleErr);
            } finally {
              migrationProgress.processedDocs++;
              migrationProgress.successCount = successCount;
              migrationProgress.errorCount = errorCount;
            }
          }
        } else {
          successCount += batch.length;
          migrationProgress.processedDocs += batch.length;
          migrationProgress.successCount = successCount;
          batch.forEach((item) => {
            existingIds.add(item.id);
            if (item.video_id) existingVideoIds.add(item.video_id);
            if (item.post_url) existingPostUrls.add(item.post_url);
          });
          const sampleTitle = batch[0]?.title || 'Video';
          console.log(`[Success] Copied batch of ${batch.length} new videos (e.g. "${sampleTitle.slice(0, 40)}...") | Total newly copied: ${successCount.toLocaleString()}`);
        }
      } catch (err: any) {
        errorCount += batch.length;
        migrationProgress.processedDocs += batch.length;
        migrationProgress.errorCount = errorCount;
        migrationProgress.lastError = err.message || String(err);
        console.error(`[Error] Batch sync failed:`, err.message || err);
      }
    };

    for await (const rawDoc of cursor) {
      const mongoId = String(rawDoc._id);
      const videoId = rawDoc.video_id ? String(rawDoc.video_id) : null;
      const postUrl = rawDoc.post_url ? String(rawDoc.post_url) : null;

      // Incremental check: SKIP if already present in Supabase!
      const alreadyExists =
        existingIds.has(mongoId) ||
        (videoId && existingVideoIds.has(videoId)) ||
        (postUrl && existingPostUrls.has(postUrl));

      if (alreadyExists) {
        skippedCount++;
        migrationProgress.processedDocs++;
        continue;
      }

      // Format document according to Supabase viralhub_db schema
      const targetDoc: Record<string, any> = {
        id: mongoId,
        slug: generateSafeSlug(rawDoc),
        video_id: videoId,
        title: (rawDoc.title || 'Untitled Video').trim(),
        post_url: postUrl,
        '480p_link': rawDoc['480p_link'] || rawDoc.video_url1 || null,
        '720p_link': rawDoc['720p_link'] || rawDoc.video_url2 || null,
        domain: rawDoc.domain || null,
        duration: rawDoc.duration || null,
        scraped_at: parseToUnixSeconds(rawDoc.scraped_at) || parseToUnixSeconds(rawDoc.created_at) || null,
        thumbnail_url: rawDoc.thumbnail_url || null,
        views: Number(rawDoc.views) || 0,
        updated_at: parseToUnixMs(rawDoc.updated_at) || Date.now(),
        site: rawDoc.site || rawDoc.domain || null,
      };

      pendingBatch.push(targetDoc);

      if (pendingBatch.length >= BATCH_SIZE) {
        const toSend = [...pendingBatch];
        pendingBatch.length = 0;
        await commitBatch(toSend);
      }
    }

    // Flush any remaining records
    if (pendingBatch.length > 0) {
      await commitBatch(pendingBatch);
    }

    if (successCount === 0 && errorCount === 0) {
      console.log(`[DB Sync] All ${totalMongoDocs.toLocaleString()} records already exist in Supabase! 0 new records were copied.`);
    }

    console.log(
      `--- Migration Summary --- Total in Mongo: ${totalMongoDocs.toLocaleString()} | Already in Supabase (Skipped): ${skippedCount.toLocaleString()} | Newly Copied: ${successCount.toLocaleString()} | Errors: ${errorCount}`
    );

    syncStatus.lastSync = new Date().toISOString();
    syncStatus.backedUpToSupabase = existingCount + successCount;
    syncStatus.supabaseCount = existingCount + successCount;
    syncStatus.mongoCount = totalMongoDocs;
    syncStatus.table = SUPABASE_TABLE_NAME;

    return {
      totalProcessed: totalMongoDocs,
      alreadyExisting: skippedCount,
      successCount,
      errorCount,
    };
  } catch (err: any) {
    migrationProgress.lastError = err?.message || String(err);
    console.error(`[Error] Migration aborted: ${err?.message || err}`);
    throw err;
  } finally {
    migrationProgress.inProgress = false;
    migrationProgress.finishedAt = new Date().toISOString();
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {}
    }
  }
}

interface SyncStatus {
  inProgress: boolean;
  lastSync: string | null;
  mongoCount: number;
  supabaseCount: number;
  importedToMongo: number;
  backedUpToSupabase: number;
  error: string | null;
  table: string | null;
  isMongoConnected: boolean;
  sync_enabled: boolean;
}

const syncStatus: SyncStatus = {
  inProgress: false,
  lastSync: null,
  mongoCount: 0,
  supabaseCount: 0,
  importedToMongo: 0,
  backedUpToSupabase: 0,
  error: null,
  table: SUPABASE_TABLE_NAME,
  isMongoConnected: false,
  sync_enabled: true,
};

function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient {
  const url = customUrl || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = customKey || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
}


export async function isDbSyncEnabled(): Promise<boolean> {
  try {
    if (process.env.MONGODB_URI) {
      await connectToDatabase();
      const setting = await SyncSettingsModel.findOne({ key: 'db_sync' }).lean();
      if (setting) {
        return Boolean((setting as any).sync_enabled);
      }
    }
    return true;
  } catch {
    return true;
  }
}

export async function setDbSyncEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (process.env.MONGODB_URI) {
      await connectToDatabase();
      await SyncSettingsModel.findOneAndUpdate(
        { key: 'db_sync' },
        { $set: { sync_enabled: enabled, updated_at: new Date() } },
        { upsert: true, new: true }
      );
    }
    syncStatus.sync_enabled = enabled;
    return enabled;
  } catch (err) {
    console.error('[DB Sync Setting] Error saving sync setting:', err);
    throw err;
  }
}

export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    if (process.env.MONGODB_URI) {
      await connectToDatabase();
      syncStatus.isMongoConnected = true;
      syncStatus.mongoCount = await PostModel.countDocuments();
      syncStatus.sync_enabled = await isDbSyncEnabled();
    } else {
      syncStatus.isMongoConnected = false;
    }
  } catch (err: any) {
    syncStatus.isMongoConnected = false;
    syncStatus.error = err.message || 'MongoDB connection error';
  }
  return syncStatus;
}

export async function runSync(options?: { customUrl?: string; customKey?: string }) {
  const enabled = await isDbSyncEnabled();
  if (!enabled) {
    return { status: 'disabled', message: 'DB Sync is currently disabled', ...syncStatus };
  }
  if (syncStatus.inProgress) {
    return { status: 'already_running', ...syncStatus };
  }

  syncStatus.inProgress = true;
  syncStatus.error = null;

  try {
    // 1. Connect to MongoDB (Primary Database)
    await connectToDatabase();
    syncStatus.isMongoConnected = true;
    syncStatus.mongoCount = await PostModel.countDocuments();

    // 2. Connect to Supabase (Backup Database)
    const supabaseClient = getSupabaseClient(options?.customUrl, options?.customKey);

    // Determine target table in Supabase: Check 'viralhub_db' first, then 'post' / 'posts'
    let targetTable = 'viralhub_db';
    const { data: vTest, error: vError } = await supabaseClient
      .from('viralhub_db')
      .select('id')
      .limit(1);

    if (vError && (vError.code === 'PGRST205' || vError.message?.includes('schema cache'))) {
      const { data: postTest, error: postError } = await supabaseClient
        .from('post')
        .select('id')
        .limit(1);

      if (!postError && postTest) {
        targetTable = 'post';
      } else {
        const { data: postsTest, error: postsError } = await supabaseClient
          .from('posts')
          .select('id')
          .limit(1);

        if (!postsError && postsTest) {
          targetTable = 'posts';
        } else {
          targetTable = 'viralhub_db';
        }
      }
    }

    syncStatus.table = targetTable;
    console.log(`[Sync] Starting Bidirectional Sync between MongoDB "posts" and Supabase "${targetTable}"...`);

    // =========================================================================
    // DIRECTION 1: Supabase → MongoDB (Import / copy data into MongoDB)
    // =========================================================================
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    let totalImportedToMongo = 0;
    let totalFetchedFromSupabase = 0;

    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabaseClient
        .from(targetTable)
        .select('*')
        .order('id', { ascending: false })
        .range(from, to);

      if (error) {
        console.warn(`[Sync] Notice reading from Supabase "${targetTable}":`, error.message);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      totalFetchedFromSupabase += data.length;

      // Bulk upsert into MongoDB 'posts' collection keyed by unique video_url
      const bulkOps = data
        .filter((item: any) => Boolean(item['720p_link'] || item['480p_link'] || item.video_url || item.post_url))
        .map((item: any) => {
          const videoUrl = item['720p_link'] || item['480p_link'] || item.video_url || item.post_url;
          return {
            updateOne: {
              filter: { video_url: videoUrl },
              update: {
                $setOnInsert: {
                  id: Number(item.id) || Date.now(),
                  title: item.title || 'Untitled Video',
                  video_url: videoUrl,
                  thumbnail_url: item.thumbnail_url || null,
                  created_at: item.created_at ? new Date(item.created_at) : new Date(),
                  views: Number(item.views) || 0,
                  video_url1: item['480p_link'] || item.video_url1 || null,
                  video_url2: item['720p_link'] || item.video_url2 || null,
                  synced_at: new Date(),
                },
              },
              upsert: true,
            },
          };
        });

      if (bulkOps.length > 0) {
        const bulkRes = await PostModel.bulkWrite(bulkOps, { ordered: false });
        totalImportedToMongo += (bulkRes.upsertedCount + bulkRes.modifiedCount);
      }

      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }

    // =========================================================================
    // DIRECTION 2: MongoDB → Supabase (Incremental Backup)
    // =========================================================================
    console.log(`[Sync] Backing up MongoDB "posts" collection to Supabase "${targetTable}"...`);
    let totalBackedUpToSupabase = 0;

    if (targetTable === 'viralhub_db') {
      const migRes = await migrateMongoToSupabase();
      totalBackedUpToSupabase = migRes.successCount;
    } else {
      const allMongoPosts = await PostModel.find({}, { title: 1, video_url: 1, thumbnail_url: 1, created_at: 1 }).lean();
      const BACKUP_CHUNK_SIZE = 250;
      for (let i = 0; i < allMongoPosts.length; i += BACKUP_CHUNK_SIZE) {
        const chunk = allMongoPosts.slice(i, i + BACKUP_CHUNK_SIZE);
        const backupPayload = chunk
          .filter(item => Boolean(item.video_url))
          .map(item => ({
            title: item.title || 'Untitled Video',
            video_url: item.video_url,
            thumbnail_url: item.thumbnail_url || null,
          }));

        if (backupPayload.length > 0) {
          const { error: backupError } = await supabaseClient
            .from(targetTable)
            .upsert(backupPayload, { onConflict: 'video_url', ignoreDuplicates: true });

          if (!backupError) {
            totalBackedUpToSupabase += backupPayload.length;
          }
        }
      }
    }

    // Refresh status
    syncStatus.mongoCount = await PostModel.countDocuments();
    syncStatus.supabaseCount = Math.max(totalFetchedFromSupabase, totalBackedUpToSupabase);
    syncStatus.importedToMongo = totalImportedToMongo;
    syncStatus.backedUpToSupabase = totalBackedUpToSupabase;
    syncStatus.lastSync = new Date().toISOString();
    syncStatus.error = null;

    console.log(
      `[Sync] Bidirectional Sync Complete: Imported ${totalImportedToMongo} to MongoDB, Backed up ${totalBackedUpToSupabase} to Supabase.`
    );

    return {
      success: true,
      mongoCount: syncStatus.mongoCount,
      supabaseCount: syncStatus.supabaseCount,
      importedToMongo: totalImportedToMongo,
      backedUpToSupabase: totalBackedUpToSupabase,
      lastSync: syncStatus.lastSync,
      table: targetTable,
    };
  } catch (err: any) {
    console.error('[Sync] Error during bidirectional sync:', err);
    syncStatus.error = err.message || 'Unknown sync error';
    return {
      success: false,
      ...syncStatus,
    };
  } finally {
    syncStatus.inProgress = false;
  }
}

/**
 * Detect whether Supabase uses 'viralhub_db', 'post', or 'posts' table
 */
export async function detectTargetTable(client: SupabaseClient): Promise<string> {
  try {
    const { data: vData, error: vError } = await client
      .from('viralhub_db')
      .select('id')
      .limit(1);

    if (!vError && vData) {
      return 'viralhub_db';
    }

    const { data: testData, error: testError } = await client
      .from('post')
      .select('id')
      .limit(1);

    if (testError && (testError.code === 'PGRST205' || testError.message?.includes('schema cache'))) {
      const { data: postsTest, error: postsError } = await client
        .from('posts')
        .select('id')
        .limit(1);

      if (!postsError && postsTest) {
        return 'posts';
      }
    }
  } catch {}
  return 'viralhub_db';
}

export type PostMutationAction = 'add' | 'delete';

export interface PostMutationPayload {
  action: PostMutationAction;
  post?: any;
  posts?: any[];
  id?: any;
  ids?: any[];
  video_url?: string;
  video_urls?: string[];
}

/**
 * Triggered ONLY when deleting posts from the dashboard.
 * Copying MongoDB data to Supabase (viralhub_db) NEVER runs automatically—it only runs
 * when the user explicitly clicks the DB Sync button (migrateMongoToSupabase).
 */
export async function syncPostMutation(payload: PostMutationPayload): Promise<void> {
  try {
    // Do NOT copy/upsert data to Supabase automatically on 'add'—wait for manual DB Sync click
    if (payload.action === 'add') {
      return;
    }

    if (payload.action === 'delete') {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !supabaseKey) return;

      const supabaseClient = getSupabaseClient();

      const strIds = new Set<string>();
      const videoIds = new Set<string>();
      const postUrls = new Set<string>();
      const videoUrls = new Set<string>();

      if (payload.id !== undefined && payload.id !== null) {
        strIds.add(String(payload.id));
        videoIds.add(String(payload.id));
      }
      if (Array.isArray(payload.ids)) {
        payload.ids.forEach((id) => {
          if (id !== undefined && id !== null) {
            strIds.add(String(id));
            videoIds.add(String(id));
          }
        });
      }
      if (payload.video_url) videoUrls.add(payload.video_url);
      if (Array.isArray(payload.video_urls)) {
        payload.video_urls.forEach((u) => {
          if (u) videoUrls.add(u);
        });
      }

      const itemsToDelete = payload.posts || (payload.post ? [payload.post] : []);
      itemsToDelete.forEach((item) => {
        if (!item) return;
        if (item._id !== undefined && item._id !== null) {
          strIds.add(String(item._id));
        }
        if (item.id !== undefined && item.id !== null) {
          strIds.add(String(item.id));
        }
        if (item.video_id !== undefined && item.video_id !== null) {
          videoIds.add(String(item.video_id));
        }
        if (item.post_url) {
          postUrls.add(String(item.post_url));
        }
        if (item.video_url) {
          videoUrls.add(String(item.video_url));
        }
        if (item['720p_link']) {
          videoUrls.add(String(item['720p_link']));
        }
        if (item['480p_link']) {
          videoUrls.add(String(item['480p_link']));
        }
      });

      const uniqueIds = Array.from(strIds).filter(Boolean);
      const uniqueVideoIds = Array.from(videoIds).filter(Boolean);
      const uniquePostUrls = Array.from(postUrls).filter(Boolean);
      const uniqueVideoUrls = Array.from(videoUrls).filter(Boolean);

      // 1. Delete from primary Supabase table: viralhub_db (where id = String(mongo._id))
      if (uniqueIds.length > 0) {
        const { error } = await supabaseClient
          .from(SUPABASE_TABLE_NAME)
          .delete()
          .in('id', uniqueIds);

        if (error) {
          console.warn(`[Supabase Delete] Notice deleting by id from ${SUPABASE_TABLE_NAME}:`, error.message);
        } else {
          console.log(`[Success] Deleted ${uniqueIds.length} record(s) by id from Supabase (${SUPABASE_TABLE_NAME})`);
        }
      }

      if (uniqueVideoIds.length > 0) {
        await supabaseClient
          .from(SUPABASE_TABLE_NAME)
          .delete()
          .in('video_id', uniqueVideoIds);
      }

      if (uniquePostUrls.length > 0) {
        await supabaseClient
          .from(SUPABASE_TABLE_NAME)
          .delete()
          .in('post_url', uniquePostUrls);
      }

      // 2. Also clean up legacy 'post' / 'posts' table if used
      if (uniqueVideoUrls.length > 0) {
        await supabaseClient.from('post').delete().in('video_url', uniqueVideoUrls);
      }
    }
  } catch (err: any) {
    console.error('[Supabase Delete] Failed to delete from Supabase:', err?.message || err);
  }
}

export function startPeriodicSync(_intervalMs = 600000) {
  // Automatic background copying is disabled.
  // MongoDB -> Supabase copy only runs when the user clicks DB Sync.
  console.log('[DB Sync] Manual mode active: MongoDB data will only copy to Supabase when DB Sync is clicked.');
}
