import express from 'express';
import { getSupabaseClient, getSupabaseDashboardStats } from '../db.js';
import { cacheGet, cacheSet } from '../cache.js';

export const statsRouter = express.Router();

// 1. GET /api/stats/overview - Instant O(1) stats from Supabase dashboard_stats table
statsRouter.get('/api/stats/overview', async (req, res) => {
  try {
    const supabaseStats = await getSupabaseDashboardStats();

    const totalVideos = supabaseStats?.total_videos || 0;
    const totalViews = supabaseStats?.total_views || 0;
    const missingThumbnails = supabaseStats?.missing_thumbnail || 0;
    const telegramUpload = supabaseStats?.telegram_upload || 0;
    const totalR2Videos = supabaseStats?.total_r2_videos || 0;
    const totalTelegramVideos = supabaseStats?.total_telegram_videos || telegramUpload;
    const videoSourcesCount = supabaseStats?.video_source || 11;
    const videoSourcesList = supabaseStats?.video_sources || [];

    const payload = {
      total_posts: totalVideos,
      total_videos: totalVideos,
      total_views: totalViews,
      missing_thumbnails: missingThumbnails,
      telegram_upload: telegramUpload,
      total_r2_videos: totalR2Videos,
      total_telegram_videos: totalTelegramVideos,
      video_source: videoSourcesCount,
      video_sources: videoSourcesList,
      supabase_total: totalVideos,
      updated_at: supabaseStats?.updated_at || new Date().toISOString(),
    };

    res.json({ success: true, stats: payload });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
  }
});

// 2. POST /api/stats/recalculate - Re-sync counters into dashboard_stats table
statsRouter.post('/api/stats/recalculate', async (_req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });

    const [
      { count: totalVideos },
      { count: missingThumb },
      { count: totalR2 },
      { count: totalTg },
      { count: totalViews }
    ] = await Promise.all([
      sb.from('viralhub_db').select('*', { count: 'exact', head: true }),
      sb.from('viralhub_db').select('*', { count: 'exact', head: true }).or('thumbnail_url.is.null,thumbnail_url.eq.,thumbnail_url.eq.null'),
      sb.from('all_videos_db').select('*', { count: 'exact', head: true }),
      sb.from('telegram_uploaded').select('*', { count: 'exact', head: true }),
      sb.from('visitor_views').select('*', { count: 'exact', head: true }),
    ]);

    const { data: updatedStats, error } = await sb
      .from('dashboard_stats')
      .upsert({
        id: 'global_stats',
        total_videos: totalVideos || 0,
        missing_thumbnail: missingThumb || 0,
        total_r2_videos: totalR2 || 0,
        telegram_upload: totalTg || 0,
        total_telegram_videos: totalTg || 0,
        total_views: totalViews || 0,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, stats: updatedStats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to recalculate stats' });
  }
});

// 3. GET /api/overview/realtime - Fast active online IP check from visitor_views
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

    res.json({
      success: true,
      totalUsers: uniqueIps.size || 1,
      totalOnline: Math.max(1, onlineIps.size),
    });
  } catch {
    res.json({ success: true, totalUsers: 1, totalOnline: 1 });
  }
});

// 4. GET /api/stats/storage - Storage statistics from Supabase all_videos_db
statsRouter.get('/api/stats/storage', async (_req, res) => {
  try {
    const sb = getSupabaseClient();
    let totalBytes = 0;
    let totalFiles = 0;

    if (sb) {
      const { data: r2Rows, count } = await sb
        .from('all_videos_db')
        .select('file_size', { count: 'exact' });

      totalFiles = count || 0;
      if (r2Rows && Array.isArray(r2Rows)) {
        for (const row of r2Rows) {
          const sz = Number(row.file_size) || 0;
          totalBytes += sz;
        }
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
  } catch {
    res.json({
      totalFiles: 0,
      totalBytes: 0,
      formattedSize: '0.0 MB',
      limit: 'Infinite',
      isInfinite: true,
    });
  }
});

// 5. GET /api/overview - Aggregated overview statistics from Supabase
statsRouter.get('/api/overview', async (req, res) => {
  try {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let targetYear = req.query.year ? parseInt(req.query.year as string, 10) : curYear;
    let targetMonth = req.query.month !== undefined ? parseInt(req.query.month as string, 10) : curMonth;

    if (isNaN(targetYear)) targetYear = curYear;
    if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) targetMonth = curMonth;

    const cacheKey = `overview:sb:${targetYear}:${targetMonth}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached && req.query.refresh !== 'true') {
      return res.json(cached);
    }

    // Instant O(1) stats from Supabase
    const supabaseStats = await getSupabaseDashboardStats();
    const totalVideos = supabaseStats?.total_videos || 0;
    const totalViews = supabaseStats?.total_views || 0;
    const telegramUpload = supabaseStats?.telegram_upload || 0;
    const totalR2Videos = supabaseStats?.total_r2_videos || 0;
    const missingThumbnail = supabaseStats?.missing_thumbnail || 0;
    const videoSource = supabaseStats?.video_source || 11;

    // Target month boundaries
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, daysInMonth, 23, 59, 59, 999));
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthShort = monthNamesShort[targetMonth];

    const sb = getSupabaseClient();
    let supabaseVisitorViewsRows: any[] = [];
    if (sb) {
      try {
        const { data } = await sb
          .from('visitor_views')
          .select('created_at, updated_at, view_counted, ip, browser, os, country')
          .limit(10000);
        if (data && Array.isArray(data)) {
          supabaseVisitorViewsRows = data;
        }
      } catch {}
    }

    // Daily traffic map
    const dailyViewsMap: Record<number, number> = {};
    const osCount: Record<string, number> = {};
    const countryCount: Record<string, number> = {};
    const browserCount: Record<string, number> = {};
    const uniqueIps = new Set<string>();
    const onlineIps = new Set<string>();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

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
      return countryMap[code] || countryMap[trimmed.toUpperCase()] || trimmed;
    };

    const normalizeBrowser = (val: string) => {
      if (!val) return 'Chrome';
      const b = val.toLowerCase();
      if (b.includes('telegram')) return 'Telegram';
      if (b.includes('edge') || b.includes('edg')) return 'Edge';
      if (b.includes('firefox') || b.includes('fxios')) return 'Firefox';
      if (b.includes('brave')) return 'Brave';
      if (b.includes('ucbrowser') || b.includes('uc browser')) return 'UC Browser';
      if (b.includes('opera') || b.includes('opr')) return 'Opera';
      if (b.includes('samsung') || b.includes('samsungbrowser')) return 'Samsung Internet';
      if (b.includes('safari') && !b.includes('chrome')) return 'Safari';
      if (b.includes('chrome') || b.includes('crios')) return 'Chrome';
      return val.trim() || 'Chrome';
    };

    for (const r of supabaseVisitorViewsRows) {
      if (r.ip) {
        uniqueIps.add(r.ip);
        const act = r.updated_at || r.created_at;
        if (act && act >= fifteenMinutesAgo) {
          onlineIps.add(r.ip);
        }
      }

      const t = r.updated_at || r.created_at;
      if (t) {
        const d = new Date(t);
        if (d.getUTCFullYear() === targetYear && d.getUTCMonth() === targetMonth) {
          const day = d.getUTCDate();
          dailyViewsMap[day] = (dailyViewsMap[day] || 0) + (Number(r.view_counted) || 1);

          const os = normalizeDevice(r.os);
          const country = normalizeCountry(r.country);
          const browser = normalizeBrowser(r.browser);

          osCount[os] = (osCount[os] || 0) + 1;
          countryCount[country] = (countryCount[country] || 0) + 1;
          browserCount[browser] = (browserCount[browser] || 0) + 1;
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

    const totalMonthTraffic = Object.values(dailyViewsMap).reduce((a, b) => a + b, 0) || 1;

    const devices = Object.entries(osCount)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalMonthTraffic) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const countries = Object.entries(countryCount)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalMonthTraffic) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const browsers = Object.entries(browserCount)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalMonthTraffic) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const payload = {
      stats: {
        totalVideos,
        totalViews,
        totalR2Videos,
        totalUploaded: telegramUpload,
        missingThumbnail,
        videoSource,
      },
      monthlyTraffic,
      visitors: {
        available: true,
        message: 'Active visitor metrics',
        totalUsers: uniqueIps.size || 1,
        totalOnline: Math.max(1, onlineIps.size),
        devices: devices.length > 0 ? devices : [{ name: 'Desktop', count: 1, percentage: 100 }],
        countries: countries.length > 0 ? countries : [{ name: 'India', count: 1, percentage: 100 }],
        browsers: browsers.length > 0 ? browsers : [{ name: 'Chrome', count: 1, percentage: 100 }],
      },
    };

    cacheSet(cacheKey, payload, 60);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch overview data' });
  }
});
