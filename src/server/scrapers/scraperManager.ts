import { connectToDatabase, ScraperSiteModel, PostModel } from '../../lib/mongodb.js';
import { lalamasaScraperModule } from './lalamasa.js';
import { viralchutScraperModule } from './viralchut.js';
import { p4455ScraperModule } from './p4455.js';
import { mydesi13ScraperModule } from './mydesi13.js';
import { mmsvibexScraperModule } from './mmsvibex.js';
import { mydesiRestScraperModule } from './mydesiRest.js';
import { mykamababaScraperModule } from './mykamababa.js';
import { masahub2ScraperModule } from './masahub2.js';
import { viralmmsScraperModule } from './viralmms.js';
import { xxxindianstoriesScraperModule } from './xxxindianstories.js';
import { SiteScraperModule, ScraperSiteInfo } from './types.js';

// Registry of all individual site scrapers (One file per site)
const scrapersRegistry: Map<string, SiteScraperModule> = new Map([
  [lalamasaScraperModule.id, lalamasaScraperModule],
  [viralchutScraperModule.id, viralchutScraperModule],
  [p4455ScraperModule.id, p4455ScraperModule],
  [mydesi13ScraperModule.id, mydesi13ScraperModule],
  [mmsvibexScraperModule.id, mmsvibexScraperModule],
  [mydesiRestScraperModule.id, mydesiRestScraperModule],
  [mykamababaScraperModule.id, mykamababaScraperModule],
  [masahub2ScraperModule.id, masahub2ScraperModule],
  [viralmmsScraperModule.id, viralmmsScraperModule],
  [xxxindianstoriesScraperModule.id, xxxindianstoriesScraperModule],
]);

const activeAbortControllers: Map<string, AbortController> = new Map();
let schedulerInterval: NodeJS.Timeout | null = null;

export function getNextScheduledTime(hour: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export async function initScraperManager(): Promise<void> {
  try {
    await connectToDatabase();

    // Ensure all registered scrapers exist in scraper_sites collection
    for (const [id, scraper] of scrapersRegistry.entries()) {
      const existing = await ScraperSiteModel.findOne({ site_id: id });
      const actualCount = await PostModel.countDocuments({ domain: scraper.domain });
      const nextRun = getNextScheduledTime(scraper.scheduleHour);

      if (!existing) {
        await ScraperSiteModel.create({
          site_id: id,
          name: scraper.name,
          domain: scraper.domain,
          base_url: scraper.baseUrl,
          cron_schedule: scraper.defaultSchedule,
          enabled: true,
          status: 'idle',
          total_scraped: actualCount,
          failed_count: 0,
          last_run_at: null,
          next_run_at: nextRun,
          last_error: null,
          updated_at: new Date(),
        });
        console.log(`[SiteScraper] Registered new site module: ${scraper.name} (${id}) -> Schedule: ${scraper.defaultSchedule}`);
      } else {
        // Sync actual posts count, correct cron_schedule, and ensure next_run_at is set properly
        await ScraperSiteModel.updateOne(
          { site_id: id },
          {
            $set: {
              name: scraper.name,
              domain: scraper.domain,
              base_url: scraper.baseUrl,
              cron_schedule: scraper.defaultSchedule,
              total_scraped: actualCount,
              status: existing.status === 'running' ? 'idle' : existing.status,
              next_run_at: existing.next_run_at || nextRun,
            },
          }
        );
      }
    }

    // Ensure posts with missing video_url are populated from 720p_link or 480p_link
    try {
      await PostModel.updateMany(
        { domain: 'www.xxxindianstories.com', $or: [{ video_url: { $exists: false } }, { video_url: null }, { video_url: '' }] },
        [
          {
            $set: {
              video_url: { $ifNull: ['$720p_link', '$480p_link'] },
              video_url2: '$720p_link',
              video_url1: '$480p_link',
            },
          },
        ]
      );
    } catch {}

    // Start staggered hourly scheduler
    startHourlyScheduler();
    console.log('[SiteScraper] Scraper Manager initialized with staggered hourly schedule (00:00, 01:00, 02:00, 03:00, 04:00).');
  } catch (error: any) {
    console.error('[SiteScraper] Initialization error:', error?.message || error);
  }
}

function startHourlyScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Check every 30 seconds for scheduled sites
  schedulerInterval = setInterval(async () => {
    try {
      await connectToDatabase();
      const now = new Date();
      const sites = await ScraperSiteModel.find({ enabled: true });

      for (const site of sites) {
        const scraper = scrapersRegistry.get(site.site_id);
        if (!scraper) continue;
        if (site.status === 'running') continue;

        const nextRun = site.next_run_at ? new Date(site.next_run_at) : null;
        if (nextRun && now >= nextRun) {
          console.log(`[SiteScraper] Scheduled trigger for "${scraper.name}" at assigned hour ${scraper.scheduleHour}:00.`);

          // Compute tomorrow's next run time to prevent re-execution today
          const nextScheduled = getNextScheduledTime(scraper.scheduleHour);
          await ScraperSiteModel.updateOne(
            { site_id: site.site_id },
            { $set: { next_run_at: nextScheduled } }
          );

          // Execute scraper in background
          runSiteScraper(site.site_id).catch((err: any) => {
            console.error(`[SiteScraper] Background scheduled run failed for ${scraper.name}:`, err?.message || err);
          });
        }
      }
    } catch (e: any) {
      console.error('[SiteScraper] Scheduler check loop error:', e?.message || e);
    }
  }, 30000);
}

export async function runAllEnabledScrapers(): Promise<void> {
  await connectToDatabase();
  const sites = await ScraperSiteModel.find({ enabled: true });

  for (const site of sites) {
    try {
      console.log(`[SiteScraper] Triggering manual run for: ${site.name}`);
      await runSiteScraper(site.site_id);
    } catch (err: any) {
      console.error(`[SiteScraper] Failed to execute ${site.site_id}:`, err?.message || err);
    }
  }
}

export async function runSiteScraper(siteId: string): Promise<{ success: boolean; newPosts: number; message: string }> {
  const scraper = scrapersRegistry.get(siteId);
  if (!scraper) {
    throw new Error(`Scraper module not found for site ID "${siteId}"`);
  }

  await connectToDatabase();
  const siteDoc = await ScraperSiteModel.findOne({ site_id: siteId });
  if (siteDoc?.status === 'running') {
    return { success: false, newPosts: 0, message: `Scraper for ${scraper.name} is already running.` };
  }

  const abortController = new AbortController();
  activeAbortControllers.set(siteId, abortController);

  await ScraperSiteModel.updateOne(
    { site_id: siteId },
    {
      $set: {
        status: 'running',
        last_run_at: new Date(),
        last_error: null,
      },
    }
  );

  console.log(`[SiteScraper] Starting execution for ${scraper.name} [ID: ${siteId}]...`);

  try {
    const result = await scraper.runIncremental(abortController.signal);
    const updatedCount = await PostModel.countDocuments({ domain: scraper.domain });
    const nextRun = getNextScheduledTime(scraper.scheduleHour);

    await ScraperSiteModel.updateOne(
      { site_id: siteId },
      {
        $set: {
          status: 'idle',
          total_scraped: updatedCount,
          next_run_at: nextRun,
          updated_at: new Date(),
        },
        $inc: {
          failed_count: result.failed,
        },
      }
    );

    console.log(`[SiteScraper] [Success] Execution finished for ${scraper.name}: ${result.newPosts} new posts, ${result.failed} failed.`);
    return {
      success: true,
      newPosts: result.newPosts,
      message: `Scraped ${result.newPosts} new posts successfully.`,
    };
  } catch (error: any) {
    const isAborted = abortController.signal.aborted;
    const finalStatus = isAborted ? 'stopped' : 'error';
    const errorMsg = error?.message || 'Execution error';

    await ScraperSiteModel.updateOne(
      { site_id: siteId },
      {
        $set: {
          status: finalStatus,
          last_error: errorMsg,
          updated_at: new Date(),
        },
      }
    );

    console.error(`[SiteScraper] Execution ended with status "${finalStatus}" for ${scraper.name}:`, errorMsg);
    throw error;
  } finally {
    activeAbortControllers.delete(siteId);
  }
}

export async function stopSiteScraper(siteId: string): Promise<boolean> {
  const controller = activeAbortControllers.get(siteId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(siteId);
  }

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

  console.log(`[SiteScraper] Stopped and disabled scraper for: ${siteId}`);
  return true;
}

export async function startSiteScraper(siteId: string): Promise<boolean> {
  const scraper = scrapersRegistry.get(siteId);
  const nextRun = scraper ? getNextScheduledTime(scraper.scheduleHour) : new Date(Date.now() + 3600000);

  await connectToDatabase();
  await ScraperSiteModel.updateOne(
    { site_id: siteId },
    {
      $set: {
        status: 'idle',
        enabled: true,
        next_run_at: nextRun,
        updated_at: new Date(),
      },
    }
  );

  console.log(`[SiteScraper] Started and enabled scraper for: ${siteId}`);
  return true;
}

export async function getAllScrapersInfo(): Promise<ScraperSiteInfo[]> {
  await connectToDatabase();

  // 1. Purge legacy duplicate record if present
  try {
    await ScraperSiteModel.deleteMany({ site_id: 'mydesi_rest' });
  } catch (err) {
    // Ignore if collection not ready
  }

  const docs = await ScraperSiteModel.find().sort({ site_id: 1 }).lean();

  const seenDomains = new Set<string>();
  const results: ScraperSiteInfo[] = [];

  for (const doc of docs) {
    // Deduplicate by domain (prevents duplicate cards in UI)
    if (seenDomains.has(doc.domain)) {
      try {
        await ScraperSiteModel.deleteOne({ _id: doc._id });
      } catch {}
      continue;
    }
    seenDomains.add(doc.domain);

    const actualCount = await PostModel.countDocuments({ domain: doc.domain });
    results.push({
      id: doc.site_id,
      name: doc.name,
      domain: doc.domain,
      base_url: doc.base_url,
      cron_schedule: doc.cron_schedule || 'Every 12 Hours',
      enabled: doc.enabled,
      status: (doc.status as any) || 'idle',
      total_scraped: actualCount,
      failed_count: doc.failed_count || 0,
      last_new_posts: doc.last_new_posts || 0,
      last_run_at: doc.last_run_at ? new Date(doc.last_run_at).toISOString() : null,
      last_run_type: (doc.last_run_type as any) || 'scheduled',
      next_run_at: doc.next_run_at ? new Date(doc.next_run_at).toISOString() : null,
      last_error: doc.last_error || null,
    });
  }

  return results;
}
