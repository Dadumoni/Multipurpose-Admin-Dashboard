import express from 'express';
import {
  connectToDatabase,
  PostModel,
  UploadedVideoModel,
  TrackedFileModel,
  getSupabaseClient,
  getSupabaseDashboardStats,
  getMongoDashboardStats,
} from '../db.js';
import { getDashboardStats, recalculateStats } from '../statsManager.js';
import { cacheGet, cacheSet } from '../cache.js';

export const statsRouter = express.Router();

// 1. GET /api/stats/overview - Instant O(1) stats from Supabase & MongoDB dashboard_stats
statsRouter.get('/api/stats/overview', async (req, res) => {
  try {
    const isForce = req.query.force === 'true';

    // Fetch instant O(1) stats concurrently from Supabase table and MongoDB doc
    const [supabaseStats, mongoStats] = await Promise.all([
      getSupabaseDashboardStats(),
      getMongoDashboardStats(),
    ]);

    const totalVideos = supabaseStats?.total_videos || mongoStats.total_videos;
    const totalViews = supabaseStats?.total_views || mongoStats.total_views;
    const missingThumbnails = supabaseStats?.missing_thumbnail || 0;
    const telegramUpload = supabaseStats?.telegram_upload || 0;
    const videoSourcesCount = supabaseStats?.video_source || 11;
    const mongoTotalVideos = mongoStats.total_videos;

    // Optional domain sources breakdown from mongo cached stats if available
    let videoSourcesList: any[] = [];
    try {
      const cachedMongoStats = await getDashboardStats(isForce);
      if (cachedMongoStats && Array.isArray(cachedMongoStats.video_sources)) {
        videoSourcesList = cachedMongoStats.video_sources;
      }
    } catch {}

    const payload = {
      total_posts: totalVideos,
      total_videos: totalVideos,
      total_views: totalViews,
      missing_thumbnails: missingThumbnails,
      telegram_upload: telegramUpload,
      video_source: videoSourcesCount,
      video_sources: videoSourcesList,
      mongo_total_videos: mongoTotalVideos,
      supabase_total: supabaseStats?.total_videos || totalVideos,
      updated_at: supabaseStats?.updated_at || new Date().toISOString(),
    };

    res.json({ success: true, stats: payload });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
  }
});

// 2. POST /api/stats/recalculate - Recalculate stats collections on demand
statsRouter.post('/api/stats/recalculate', async (_req, res) => {
  try {
    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.rpc('recalculate_dashboard_stats');
      } catch {}
    }
    const stats = await recalculateStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to recalculate stats' });
  }
});

// 3. GET /api/overview/realtime - Fast active online IP check
statsRouter.get('/api/overview/realtime', async (_req, res) => {
  try {
    const sb = getSupabaseClient();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const uniqueIps = new Set<string>();
    const onlineIps = new Set<string>();

    if (sb) {
      const { data: recentVisitors } = await sb
        .from('visitor_views')
        .select('ip, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(2000);

      if (recentVisitors && Array.isArray(recentVisitors)) {
        for (const row of recentVisitors) {
          if (row.ip) {
            uniqueIps.add(row.ip);
            const act = row.updated_at || row.created_at;
            if (act && act >= fifteenMinutesAgo) {
              onlineIps.add(row.ip);
            }
          }
        }
      }
    }

    return res.json({
      success: true,
      totalUsers: uniqueIps.size,
      totalOnline: onlineIps.size,
    });
  } catch (e: any) {
    return res.json({ success: false, totalUsers: 0, totalOnline: 0 });
  }
});

// 4. GET /api/storage/stats - Calculate storage used
statsRouter.get('/api/storage/stats', async (_req, res) => {
  try {
    await connectToDatabase();
    const [uploadedVideos, trackedFiles] = await Promise.all([
      UploadedVideoModel.find().lean(),
      TrackedFileModel.find().lean(),
    ]);

    let totalBytes = 0;
    const totalFiles = uploadedVideos.length;

    for (const item of uploadedVideos) {
      if (item.file_size) {
        const match = String(item.file_size).match(/([0-9.]+)s*(MB|GB|KB|Bytes)?/i);
        if (match) {
          const val = parseFloat(match[1]);
          const unit = (match[2] || 'MB').toUpperCase();
          if (unit === 'GB') totalBytes += val * 1024 * 1024 * 1024;
          else if (unit === 'MB') totalBytes += val * 1024 * 1024;
          else if (unit === 'KB') totalBytes += val * 1024;
          else totalBytes += val;
        } else {
          totalBytes += 45 * 1024 * 1024;
        }
      } else {
        totalBytes += 45 * 1024 * 1024;
      }
    }

    let formattedSize = '0.0 MB';
    if (totalBytes >= 1024 * 1024 * 1024) {
      formattedSize = (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    } else {
      formattedSize = (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    res.json({
      totalFiles,
      totalBytes,
      formattedSize,
      limit: 'Infinite',
      isInfinite: true,
    });
  } catch (error: any) {
    res.json({
      totalFiles: 0,
      totalBytes: 0,
      formattedSize: '0.0 MB',
      limit: 'Infinite',
      isInfinite: true,
    });
  }
});

// 5. GET /api/overview - Aggregated overview statistics with zero full table scans
statsRouter.get('/api/overview', async (req, res) => {
  try {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let targetYear = req.query.year ? parseInt(req.query.year as string, 10) : curYear;
    let targetMonth = req.query.month !== undefined ? parseInt(req.query.month as string, 10) : curMonth;

    if (isNaN(targetYear)) targetYear = curYear;
    if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) targetMonth = curMonth;

    if (targetYear > curYear || (targetYear === curYear && targetMonth > curMonth)) {
      targetYear = curYear;
      targetMonth = curMonth;
    }

    const cacheKey = `overview:stats:${targetYear}:${targetMonth}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached && req.query.refresh !== 'true') {
      return res.json(cached);
    }

    await connectToDatabase();

    // 1. Instant O(1) stats from Supabase and MongoDB
    const [supabaseStats, mongoStats] = await Promise.all([
      getSupabaseDashboardStats(),
      getMongoDashboardStats(),
    ]);

    const mongoTotalVideos = mongoStats.total_videos;
    const supabaseTotalVideos = supabaseStats?.total_videos || mongoTotalVideos;
    const totalViews = supabaseStats?.total_views || mongoStats.total_views;
    const telegramUpload = supabaseStats?.telegram_upload || 0;
    const missingThumbnail = supabaseStats?.missing_thumbnail || 0;

    // Target month boundaries
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, daysInMonth, 23, 59, 59, 999));

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesLong = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthShort = monthNamesShort[targetMonth];
    const monthLong = monthNamesLong[targetMonth];

    // Fetch visitor events and daily views
    const sb = getSupabaseClient();
    let supabaseVisitorViewsRows: any[] = [];
    if (sb) {
      try {
        const { data } = await sb
          .from('visitor_views')
          .select('created_at, updated_at, view_counted')
          .limit(10000);
        if (data && Array.isArray(data)) {
          supabaseVisitorViewsRows = data;
        }
      } catch {}
    }

    // Daily traffic map
    const dailyViewsMap: Record<number, number> = {};
    if (supabaseVisitorViewsRows.length > 0) {
      for (const r of supabaseVisitorViewsRows) {
        const t = r.updated_at || r.created_at;
        if (t) {
          const d = new Date(t);
          if (d.getUTCFullYear() === targetYear && d.getUTCMonth() === targetMonth) {
            const day = d.getUTCDate();
            dailyViewsMap[day] = (dailyViewsMap[day] || 0) + (Number(r.view_counted) || 1);
          }
        }
      }
    }

    const monthlyTraffic = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dayStr = day < 10 ? `0${day}` : `${day}`;
      return {
        day,
        date: `${monthShort} ${dayStr}`,
        name: `${monthShort} ${dayStr}`,
        views: dailyViewsMap[day] || 0,
      };
    });

    // Visitor Breakdown (Devices, Countries, Browsers)
    const normalizeDevice = (val: string) => {
      if (!val) return 'Desktop';
      const o = val.toLowerCase();
      if (o.includes('win')) return 'Windows';
      if (o.includes('android')) return 'Android';
      if (o.includes('ios') || o.includes('iphone') || o.includes('ipad')) return 'iOS';
      if (o.includes('mac')) return 'macOS';
      if (o.includes('linux')) return 'Linux';
      return val.trim() || 'Desktop';
    };

    const normalizeCountry = (val: string) => {
      if (!val) return 'Unknown';
      const trimmed = val.trim();
      const code = trimmed.split(/[, -]/)[0].trim().toUpperCase();
      const countryMap: Record<string, string> = {
        IN: 'India', US: 'United States', BD: 'Bangladesh', PK: 'Pakistan',
        GB: 'United Kingdom', UK: 'United Kingdom', CA: 'Canada', AU: 'Australia',
        DE: 'Germany', FR: 'France', NP: 'Nepal', AE: 'United Arab Emirates',
        SA: 'Saudi Arabia', RU: 'Russia', BR: 'Brazil', ID: 'Indonesia',
        PH: 'Philippines', MY: 'Malaysia', SG: 'Singapore',
      };
      if (countryMap[code]) return countryMap[code];
      if (countryMap[trimmed.toUpperCase()]) return countryMap[trimmed.toUpperCase()];
      return trimmed;
    };

    const normalizeBrowser = (val: string) => {
      if (!val) return 'Chrome';
      const b = val.toLowerCase();
      if (b.includes('telegram')) return 'Telegram In-App';
      if (b.includes('brave') || b.includes('ucbrowser')) return 'Brave / UC Browser';
      if (b.includes('firefox') || b.includes('fxios')) return 'Firefox / Edge';
      if (b.includes('edge') || b.includes('edg')) return 'Firefox / Edge';
      if (b.includes('safari') && !b.includes('chrome')) return 'Safari';
      if (b.includes('chrome') || b.includes('crios')) return 'Chrome';
      if (b.includes('opera') || b.includes('opr')) return 'Opera';
      return val.trim() || 'Chrome';
    };

    let visitorsData = {
      available: false,
      message: 'No visitor data available yet.',
      totalUsers: 0,
      totalOnline: 0,
      devices: [] as { name: string; count: number; percentage: number }[],
      countries: [] as { name: string; count: number; percentage: number }[],
      browsers: [] as { name: string; count: number; percentage: number }[],
    };

    if (sb) {
      try {
        const { data: vRows } = await sb
          .from('visitor_views')
          .select('ip, device, os, country, browser, created_at, updated_at')
          .limit(10000);

        if (vRows && Array.isArray(vRows) && vRows.length > 0) {
          const uniqueIps = new Set<string>();
          const onlineIps = new Set<string>();
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

          const osCount: Record<string, number> = {};
          const countryCount: Record<string, number> = {};
          const browserCount: Record<string, number> = {};
          let monthMatchingRows = 0;

          for (const row of vRows) {
            if (row.ip) {
              uniqueIps.add(row.ip);
              const activityTime = row.updated_at || row.created_at;
              if (activityTime && activityTime >= fifteenMinutesAgo) {
                onlineIps.add(row.ip);
              }
            }

            const rowTime = row.created_at || row.updated_at;
            const isMatchMonth = rowTime
              ? new Date(rowTime) >= startOfMonth && new Date(rowTime) <= endOfMonth
              : true;

            if (isMatchMonth) {
              monthMatchingRows++;
              const os = normalizeDevice(row.os);
              const country = normalizeCountry(row.country);
              const browser = normalizeBrowser(row.browser);

              osCount[os] = (osCount[os] || 0) + 1;
              countryCount[country] = (countryCount[country] || 0) + 1;
              browserCount[browser] = (browserCount[browser] || 0) + 1;
            }
          }

          const baseCount = monthMatchingRows > 0 ? monthMatchingRows : vRows.length;
          const devices = Object.entries(osCount)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
              name,
              count,
              percentage: baseCount > 0 ? Math.round((count / baseCount) * 100) : 0,
            }));

          const countries = Object.entries(countryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({
              name,
              count,
              percentage: baseCount > 0 ? Math.round((count / baseCount) * 100) : 0,
            }));

          const browsers = Object.entries(browserCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({
              name,
              count,
              percentage: baseCount > 0 ? Math.round((count / baseCount) * 100) : 0,
            }));

          visitorsData = {
            available: true,
            message: '',
            totalUsers: uniqueIps.size,
            totalOnline: onlineIps.size,
            devices,
            countries,
            browsers,
          };
        }
      } catch {}
    }

    const responsePayload = {
      stats: {
        totalVideos: supabaseTotalVideos,
        totalViews,
        totalScraped: supabaseTotalVideos,
        totalUploaded: telegramUpload,
        mongoTotalVideos,
        supabaseTotal: supabaseTotalVideos,
        missingThumbnail,
        videoSource: supabaseStats?.video_source || 11,
        currentMonth: monthLong,
        currentYear: targetYear,
        selectedMonth: targetMonth,
        selectedYear: targetYear,
      },
      monthlyTraffic,
      visitors: visitorsData,
    };

    cacheSet(cacheKey, responsePayload, 60);
    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch overview data' });
  }
});
