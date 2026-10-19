import express from 'express';
import axios from 'axios';
import {
  getAllScrapersInfo,
  runSiteScraper,
  stopSiteScraper,
  startSiteScraper,
} from '../scrapers/scraperManager.js';
import { connectToDatabase, ScraperSiteModel, DashboardStatsModel } from '../db.js';

export const scrapersRouter = express.Router();

const getScraperAppUrl = () => (process.env.SCRAPER_APP_URL || '').trim().replace(/\/+$/, '');

// 1. GET /api/scrapers/status - Check health & status of external Python Scraper service (e.g. on Koyeb)
scrapersRouter.get('/api/scrapers/status', async (_req, res) => {
  const scraperUrl = getScraperAppUrl();
  if (!scraperUrl) {
    return res.json({
      online: false,
      configured: false,
      is_running: false,
      message: 'SCRAPER_APP_URL is not set in environment variables.',
      app_url: '',
    });
  }

  try {
    const response = await axios.get(`${scraperUrl}/api/status`, {
      timeout: 4000,
      headers: { 'User-Agent': 'Multipurpose-Dashboard/1.0' },
    });
    return res.json({
      online: true,
      configured: true,
      is_running: response.data?.is_running ?? true,
      active_site: response.data?.active_site || null,
      message: response.data?.message || 'Scraper Engine is Online',
      app_url: scraperUrl,
    });
  } catch (error: any) {
    return res.json({
      online: false,
      configured: true,
      is_running: false,
      message: error?.response?.data?.message || error?.message || 'External scraper is offline or asleep',
      app_url: scraperUrl,
    });
  }
});

// 2. POST /api/scrapers/master - Master Pause/Resume All Scrapers
scrapersRouter.post('/api/scrapers/master', async (req, res) => {
  const scraperUrl = getScraperAppUrl();
  const { action } = req.body; // 'pause' | 'resume'

  if (!scraperUrl) {
    return res.status(400).json({ error: 'SCRAPER_APP_URL is not configured' });
  }

  try {
    const response = await axios.post(
      `${scraperUrl}/api/control/master`,
      { action },
      { timeout: 6000 }
    );
    return res.json(response.data);
  } catch (error: any) {
    console.error('[SiteScraper Master Control Error]:', error?.message || error);
    return res.status(500).json({
      error: error?.response?.data?.error || error?.message || 'Failed to control master scraper',
    });
  }
});

// 3. GET /api/scrapers - List all scraper sites from MongoDB (Instant O(1) from dashboard_stats)
scrapersRouter.get('/api/scrapers', async (_req, res) => {
  try {
    await connectToDatabase();
    const [sites, ds] = await Promise.all([
      getAllScrapersInfo(),
      DashboardStatsModel.findOne({ id: 'global_stats' }).lean(),
    ]);

    const totalScraped = ds?.total_post_scraped ?? sites.reduce((acc, s) => acc + (s.total_scraped || 0), 0);
    const totalFailed = ds?.failed_extractions ?? sites.reduce((acc, s) => acc + (s.failed_count || 0), 0);

    res.json({
      success: true,
      sites,
      total_post_scraped: totalScraped,
      failed_extractions: totalFailed,
      sites_scraped: ds?.sites_scraped || {},
    });
  } catch (error: any) {
    console.error('[SiteScraper API] Failed to fetch scraper sites:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch scraper sites' });
  }
});

// 4. POST /api/scrapers/:id/run - Trigger incremental run for a single site (Manual Run)
scrapersRouter.post('/api/scrapers/:id/run', async (req, res) => {
  try {
    const siteId = req.params.id;
    const scraperUrl = getScraperAppUrl();

    // Mark as manual run in MongoDB immediately; preserve next_run_at schedule unchanged!
    try {
      await connectToDatabase();
      await ScraperSiteModel.updateOne(
        { site_id: siteId },
        {
          $set: {
            status: 'running',
            last_run_at: new Date(),
            last_run_type: 'manual',
            updated_at: new Date(),
          },
        }
      );
    } catch (dbErr) {
      console.warn(`[SiteScraper API] Notice updating manual run state for ${siteId}:`, dbErr);
    }

    if (scraperUrl) {
      try {
        const resp = await axios.post(
          `${scraperUrl}/api/control/site`,
          { site: siteId, action: 'run' },
          { timeout: 5000 }
        );
        return res.json(resp.data);
      } catch (apiErr: any) {
        console.warn(`[SCRAPER_APP_URL] Run trigger notice for ${siteId}: ${apiErr?.message}`);
      }
    }

    res.json({ success: true, message: `Scraper execution requested for "${siteId}"` });
  } catch (error: any) {
    console.error(`[SiteScraper API] Failed to run scraper ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to start scraper' });
  }
});

// 4b. POST /api/scrapers/:id/full-scan - Trigger full site rescan (postpones others by 12h)
scrapersRouter.post('/api/scrapers/:id/full-scan', async (req, res) => {
  try {
    const siteId = req.params.id;
    const scraperUrl = getScraperAppUrl();
    const postponeTime = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now

    try {
      await connectToDatabase();
      await ScraperSiteModel.updateOne(
        { site_id: siteId },
        {
          $set: {
            status: 'full_scanning',
            last_run_at: new Date(),
            last_run_type: 'full_scan',
            updated_at: new Date(),
          },
        }
      );
      // Postpone all other sites by 12 hours while full scan executes
      await ScraperSiteModel.updateMany(
        { site_id: { $ne: siteId } },
        {
          $set: {
            status: 'postponed',
            next_run_at: postponeTime,
            updated_at: new Date(),
          },
        }
      );
    } catch (dbErr) {
      console.warn(`[SiteScraper API] Notice updating full scan state for ${siteId}:`, dbErr);
    }

    if (scraperUrl) {
      try {
        const resp = await axios.post(
          `${scraperUrl}/api/control/site`,
          { site: siteId, action: 'full_scan' },
          { timeout: 8000 }
        );
        return res.json(resp.data);
      } catch (apiErr: any) {
        console.warn(`[SCRAPER_APP_URL] Full scan proxy notice for ${siteId}: ${apiErr?.message}`);
      }
    }

    res.json({ success: true, message: `Full scan scheduled for "${siteId}". Other sites postponed until complete.` });
  } catch (error: any) {
    console.error(`[SiteScraper API] Failed to run full scan for ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to start full scan' });
  }
});

// 5. POST /api/scrapers/:id/stop - Stop a single site scraper
scrapersRouter.post('/api/scrapers/:id/stop', async (req, res) => {
  try {
    const siteId = req.params.id;
    const scraperUrl = getScraperAppUrl();

    try {
      await connectToDatabase();
      await ScraperSiteModel.updateOne(
        { site_id: siteId },
        {
          $set: {
            status: 'stopped',
            enabled: false,
            updated_at: new Date(),
          },
        }
      );
    } catch {}

    if (scraperUrl) {
      try {
        await axios.post(
          `${scraperUrl}/api/control/site`,
          { site: siteId, action: 'stop' },
          { timeout: 5000 }
        );
      } catch (apiErr: any) {
        console.warn(`[SCRAPER_APP_URL] Stop forward notice for ${siteId}: ${apiErr?.message}`);
      }
    }

    await stopSiteScraper(siteId);
    res.json({ success: true, message: `Scraper stopped for "${siteId}"` });
  } catch (error: any) {
    console.error(`[SiteScraper API] Failed to stop scraper ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to stop scraper' });
  }
});

// 6. POST /api/scrapers/:id/start - Start/Restart a single site scraper
scrapersRouter.post('/api/scrapers/:id/start', async (req, res) => {
  try {
    const siteId = req.params.id;
    const scraperUrl = getScraperAppUrl();

    try {
      await connectToDatabase();
      await ScraperSiteModel.updateOne(
        { site_id: siteId },
        {
          $set: {
            status: 'idle',
            enabled: true,
            updated_at: new Date(),
          },
        }
      );
    } catch {}

    if (scraperUrl) {
      try {
        await axios.post(
          `${scraperUrl}/api/control/site`,
          { site: siteId, action: 'start' },
          { timeout: 5000 }
        );
      } catch (apiErr: any) {
        console.warn(`[SCRAPER_APP_URL] Start forward notice for ${siteId}: ${apiErr?.message}`);
      }
    }

    await startSiteScraper(siteId);
    res.json({ success: true, message: `Scraper restarted and enabled for "${siteId}"` });
  } catch (error: any) {
    console.error(`[SiteScraper API] Failed to start scraper ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to start scraper' });
  }
});
