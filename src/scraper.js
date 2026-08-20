import {
  extractVideoLinks,
  extractThumbnail,
  extractTitle,
  extractPostLinks,
  uploadThumbnailToR2,
  generateUniqueSlug,
  addHours,
  ok, error, json,
} from './utils.js';

const SCRAPE_DELAY_MS = 10_000; // 10 seconds between posts
const SCAN_INTERVAL_HOURS = 24;

// ─── Fetch helper with timeout ───────────────────────────────────────────────
async function fetchPage(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MultiTool-Scraper/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ─── Process a single post URL ───────────────────────────────────────────────
async function processPost(postUrl, db, r2, r2PublicUrl, existingUrls) {
  // Skip already-scraped posts
  if (existingUrls.has(postUrl)) return { skipped: true, count: 0 };

  let html;
  try {
    html = await fetchPage(postUrl);
  } catch (e) {
    return { error: e.message, count: 0 };
  }

  const title = extractTitle(html);
  const thumbnailSrc = extractThumbnail(html, postUrl);
  const videoLinks = extractVideoLinks(html);

  if (videoLinks.length === 0) return { skipped: true, reason: 'no_videos', count: 0 };

  let saved = 0;

  for (const { url: videoLink, type } of videoLinks) {
    const slug = await generateUniqueSlug(db);

    // Upload thumbnail to R2 (non-blocking — continue if it fails)
    let thumbnailUrl = thumbnailSrc;
    if (thumbnailSrc) {
      const r2Url = await uploadThumbnailToR2(r2, r2PublicUrl, thumbnailSrc, slug);
      if (r2Url) thumbnailUrl = r2Url;
    }

    await db.prepare(
      `INSERT OR IGNORE INTO videos (title, slug, thumbnail_url, video_link, type)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(title, slug, thumbnailUrl, videoLink, type).run();

    saved++;
  }

  return { count: saved, title };
}

// ─── POST /api/scrape — start a scrape job ───────────────────────────────────
export async function handleScrape(request, env) {
  const { db, R2, R2_PUBLIC_URL } = env;
  const { url } = await request.json();

  if (!url) return error('url required');
  try { new URL(url); } catch (_) { return error('invalid URL'); }

  // Use waitUntil to run scraping in background after response
  const scrapeJob = async () => {
    console.log(`[Scraper] Starting scrape: ${url}`);

    let html;
    try {
      html = await fetchPage(url);
    } catch (e) {
      console.error(`[Scraper] Failed to fetch index: ${e.message}`);
      return;
    }

    const postLinks = extractPostLinks(html, url);
    console.log(`[Scraper] Found ${postLinks.length} posts`);

    // Load all existing video links to skip duplicates
    const existingRows = await db.prepare('SELECT video_link FROM videos').all();
    const existingUrls = new Set((existingRows.results || []).map(r => r.video_link));

    let totalSaved = 0;

    for (let i = 0; i < postLinks.length; i++) {
      const postUrl = postLinks[i];
      console.log(`[Scraper] Processing [${i + 1}/${postLinks.length}]: ${postUrl}`);

      const result = await processPost(postUrl, db, R2, R2_PUBLIC_URL, existingUrls);
      totalSaved += result.count || 0;

      // Register site if not already there
      await db.prepare(
        `INSERT OR IGNORE INTO sites (url, name, last_scanned_at, next_scan_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?)`
      ).bind(
        new URL(url).origin,
        new URL(url).hostname,
        addHours(new Date(), SCAN_INTERVAL_HOURS).toISOString()
      ).run();

      // 10 second delay between posts (skip delay on last post)
      if (i < postLinks.length - 1) {
        await new Promise(r => setTimeout(r, SCRAPE_DELAY_MS));
      }
    }

    // Update site last scan info
    await db.prepare(
      `UPDATE sites SET last_scanned_at=CURRENT_TIMESTAMP, total_scraped=total_scraped+?,
       next_scan_at=?, last_post_url=? WHERE url=?`
    ).bind(
      totalSaved,
      addHours(new Date(), SCAN_INTERVAL_HOURS).toISOString(),
      postLinks[0] || null,
      new URL(url).origin
    ).run();

    console.log(`[Scraper] Done. Saved ${totalSaved} videos.`);
  };

  // Start job in background
  env.ctx?.waitUntil(scrapeJob());

  return ok({ message: 'Scrape job started', url });
}

// ─── POST /api/scrape/preview — preview a single URL (no save) ──────────────
export async function handleScrapePreview(request, env) {
  const { url } = await request.json();
  if (!url) return error('url required');

  let html;
  try {
    html = await fetchPage(url);
  } catch (e) {
    return error(`Fetch failed: ${e.message}`);
  }

  const title = extractTitle(html);
  const thumbnail = extractThumbnail(html, url);
  const videoLinks = extractVideoLinks(html);
  const postLinks = extractPostLinks(html, url);

  return ok({ title, thumbnail, videoLinks, postCount: postLinks.length, postLinks: postLinks.slice(0, 5) });
}

// ─── Cron: auto-scan monitored sites every 24h ───────────────────────────────
export async function handleCronScan(env) {
  const { db, R2, R2_PUBLIC_URL } = env;
  const now = new Date().toISOString();

  // Find sites due for scanning
  const due = await db.prepare(
    `SELECT * FROM sites WHERE status='active' AND (next_scan_at IS NULL OR next_scan_at <= ?) LIMIT 5`
  ).bind(now).all();

  const sites = due.results || [];
  console.log(`[Cron] Scanning ${sites.length} sites`);

  for (const site of sites) {
    console.log(`[Cron] Scanning: ${site.url}`);

    let html;
    try {
      html = await fetchPage(site.url);
    } catch (e) {
      await db.prepare("UPDATE sites SET status='error' WHERE id=?").bind(site.id).run();
      continue;
    }

    const postLinks = extractPostLinks(html, site.url);

    // Only process posts newer than last scan position
    let newPosts = postLinks;
    if (site.last_post_url) {
      const idx = postLinks.indexOf(site.last_post_url);
      newPosts = idx > -1 ? postLinks.slice(0, idx) : postLinks;
    }

    const existingRows = await db.prepare('SELECT video_link FROM videos').all();
    const existingUrls = new Set((existingRows.results || []).map(r => r.video_link));

    let totalSaved = 0;
    for (let i = 0; i < newPosts.length; i++) {
      const result = await processPost(newPosts[i], db, R2, R2_PUBLIC_URL, existingUrls);
      totalSaved += result.count || 0;
      if (i < newPosts.length - 1) await new Promise(r => setTimeout(r, SCRAPE_DELAY_MS));
    }

    await db.prepare(
      `UPDATE sites SET last_scanned_at=CURRENT_TIMESTAMP, total_scraped=total_scraped+?,
       next_scan_at=?, last_post_url=?, status='active' WHERE id=?`
    ).bind(
      totalSaved,
      addHours(new Date(), SCAN_INTERVAL_HOURS).toISOString(),
      newPosts[0] || site.last_post_url,
      site.id
    ).run();

    console.log(`[Cron] ${site.url}: saved ${totalSaved} new videos`);
  }
}
