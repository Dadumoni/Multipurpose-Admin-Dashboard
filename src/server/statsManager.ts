import {
  connectToDatabase,
  PostModel,
  UploadedVideoModel,
  DashboardStatsModel,
  IDashboardStats,
  IDomainSource,
} from '../lib/mongodb.js';

let isRecalculating = false;
let debounceTimer: NodeJS.Timeout | null = null;
let changeStreamActive = false;

/**
 * Perform a full recalculation of aggregated stats across all collections
 * and upsert into the dedicated 'dashboard_stats' collection.
 */
export async function recalculateStats(): Promise<IDashboardStats | null> {
  if (isRecalculating) {
    console.log('[StatsManager] Recalculation already in progress, skipping duplicate call.');
    const existing = await DashboardStatsModel.findOne({ id: 'global_stats' }).lean();
    return existing as IDashboardStats | null;
  }

  isRecalculating = true;
  const startTime = Date.now();

  try {
    await connectToDatabase();

    const [totalPosts, totalUploaded, totalViewsAgg, domainAgg, recentPosts] = await Promise.all([
      PostModel.countDocuments(),
      UploadedVideoModel.countDocuments().catch(() => 0),
      PostModel.aggregate([
        { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$views', 0] } } } },
      ]),
      PostModel.aggregate([
        { $group: { _id: { $ifNull: ['$domain', 'Unknown'] }, count: { $sum: 1 }, totalViews: { $sum: { $ifNull: ['$views', 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
      PostModel.find().sort({ created_at: -1 }).limit(10).lean(),
    ]);

    const totalViews = totalViewsAgg[0]?.totalViews || 0;
    const totalVideos = totalPosts + totalUploaded;

    // Build normalized video sources breakdown with percentage
    const videoSources: IDomainSource[] = domainAgg.map((item) => {
      const count = Number(item.count) || 0;
      const percentage = totalPosts > 0 ? Number(((count / totalPosts) * 100).toFixed(1)) : 0;
      return {
        domain: String(item._id || 'Unknown'),
        count,
        percentage,
        totalViews: Number(item.totalViews) || 0,
      };
    });

    // Check latest scraped timestamp
    let lastScrapedAt: Date | null = null;
    try {
      const latestScrapedDoc = await PostModel.findOne({ scraped_at: { $ne: null } })
        .sort({ scraped_at: -1 })
        .select('scraped_at')
        .lean();
      if (latestScrapedDoc?.scraped_at) {
        const rawTs = Number(latestScrapedDoc.scraped_at);
        if (!isNaN(rawTs) && rawTs > 0) {
          lastScrapedAt = new Date(rawTs <= 9999999999 ? rawTs * 1000 : rawTs);
        }
      }
    } catch {}

    // Build site-by-site scraped counts and calculate totals
    const sitesScraped: Record<string, number> = {};
    for (const item of domainAgg) {
      if (item._id && item._id !== 'Unknown') {
        sitesScraped[String(item._id)] = Number(item.count) || 0;
      }
    }

    let totalScrapedSum = 0;
    let totalFailedSum = 0;
    try {
      const { ScraperSiteModel } = await import('../lib/mongodb.js');
      const allSites = await ScraperSiteModel.find({}).lean();
      for (const s of allSites) {
        const count = sitesScraped[s.domain] || s.total_scraped || 0;
        sitesScraped[s.site_id] = count;
        totalScrapedSum += count;
        totalFailedSum += (s.failed_count || 0);

        if (s.total_scraped !== count) {
          await ScraperSiteModel.updateOne({ site_id: s.site_id }, { $set: { total_scraped: count } });
        }
      }
    } catch {}

    const payload: Partial<IDashboardStats> = {
      id: 'global_stats',
      total_posts: totalPosts,
      total_uploaded: totalUploaded,
      total_videos: totalVideos,
      total_views: totalViews,
      total_post_scraped: totalScrapedSum > 0 ? totalScrapedSum : totalPosts,
      failed_extractions: totalFailedSum,
      sites_scraped: sitesScraped,
      video_sources: videoSources,
      recent_posts: recentPosts,
      last_scraped_at: lastScrapedAt,
      updated_at: new Date(),
    };

    const savedDoc = await DashboardStatsModel.findOneAndUpdate(
      { id: 'global_stats' },
      { $set: payload },
      { upsert: true, returnDocument: 'after' }
    ).lean();

    const elapsed = Date.now() - startTime;
    console.log(
      `[StatsManager] Recalculated dashboard stats in ${elapsed}ms -> Total Posts: ${totalPosts.toLocaleString()}, Scraped: ${(payload.total_post_scraped || 0).toLocaleString()}, Failed: ${totalFailedSum}, Sources: ${videoSources.length}`
    );

    return savedDoc as IDashboardStats;
  } catch (err: any) {
    console.error('[StatsManager] Error recalculating dashboard stats:', err);
    return null;
  } finally {
    isRecalculating = false;
  }
}

/**
 * Schedule a debounced recalculation (e.g. 10s delay).
 * Prevents thrashing the DB during heavy bulk scrape or upload streams.
 */
export function scheduleDebouncedRecalculate(delayMs = 10000): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    recalculateStats().catch((err) => console.warn('[StatsManager] Debounced recalculate notice:', err));
  }, delayMs);
}

/**
 * Retrieve cached dashboard stats from 'dashboard_stats' collection in 1ms.
 * Fallback to recalculateStats if not present.
 */
export async function getDashboardStats(forceRefresh = false): Promise<IDashboardStats | null> {
  await connectToDatabase();

  if (!forceRefresh) {
    const cachedStats = await DashboardStatsModel.findOne({ id: 'global_stats' }).lean();
    if (cachedStats && typeof cachedStats.total_posts === 'number' && cachedStats.total_posts > 0) {
      return cachedStats as IDashboardStats;
    }
  }

  return recalculateStats();
}

/**
 * Initialize MongoDB Change Stream listener on 'posts' collection.
 * Automatically increments/decrements total counts in realtime whenever scrapers
 * or external processes insert, delete or update posts.
 */
export async function initStatsChangeStream(): Promise<void> {
  if (changeStreamActive) return;

  try {
    await connectToDatabase();

    // Check if collection has documents and can watch
    const changeStream = PostModel.watch([], { fullDocument: 'default' });
    changeStreamActive = true;

    console.log('[StatsManager] Realtime MongoDB Change Stream active on "posts" collection.');

    changeStream.on('change', async (change: any) => {
      try {
        const op = change.operationType;

        if (op === 'insert') {
          const doc = change.fullDocument;
          const views = Number(doc?.views) || 0;

          await DashboardStatsModel.updateOne(
            { id: 'global_stats' },
            {
              $inc: {
                total_posts: 1,
                total_videos: 1,
                total_views: views,
              },
              $set: { updated_at: new Date() },
            },
            { upsert: true }
          );

          // Schedule domain percentage update in the background
          scheduleDebouncedRecalculate();
        } else if (op === 'delete') {
          await DashboardStatsModel.updateOne(
            { id: 'global_stats' },
            {
              $inc: {
                total_posts: -1,
                total_videos: -1,
              },
              $set: { updated_at: new Date() },
            },
            { upsert: true }
          );

          scheduleDebouncedRecalculate();
        } else if (op === 'update' || op === 'replace') {
          scheduleDebouncedRecalculate();
        }
      } catch (err: any) {
        console.warn('[StatsManager] Change stream event handler notice:', err.message);
      }
    });

    changeStream.on('error', (err: any) => {
      console.warn('[StatsManager] Change stream notice:', err.message);
      changeStreamActive = false;
      // Retry in 30 seconds
      setTimeout(() => initStatsChangeStream(), 30000);
    });

    changeStream.on('close', () => {
      changeStreamActive = false;
    });
  } catch (err: any) {
    console.warn('[StatsManager] Change stream unavailable (non-replica set or permissions):', err.message);
    changeStreamActive = false;
  }
}
