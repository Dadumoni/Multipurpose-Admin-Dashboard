import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2PublicUrl } from '../r2Helper.js';
import { connectToDatabase, PostModel } from '../../lib/mongodb.js';
import { SiteScraperModule } from './types.js';

const BASE_DOMAIN = 'https://p4455.com';
const START_PAGE_URL = `${BASE_DOMAIN}/latest`;
const CURRENT_DOMAIN = 'p4455.com';
const SITE_NAME = 'p4455';

const HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': `${BASE_DOMAIN}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return 'Untitled';
  const cleaned = rawTitle.replace(/[\s\-\–|]*mydesi\.net.*$/i, '').trim();
  return cleaned || rawTitle.trim();
}

async function uploadThumbnailToR2(imageBuffer: Buffer, r2Path: string): Promise<string | null> {
  try {
    const s3 = getR2Client();
    const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: r2Path,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return getR2PublicUrl(r2Path);
  } catch (error: any) {
    console.error(`[SiteScraper:p4455] Cloudflare R2 Upload Error (${r2Path}):`, error?.message || error);
    return null;
  }
}

async function fetchSoup(url: string, signal?: AbortSignal): Promise<{ $: cheerio.CheerioAPI | null; html: string }> {
  try {
    const resp = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
      signal,
    });

    if (resp.status === 200 && resp.data) {
      const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
      const $ = cheerio.load(html);
      return { $, html };
    }
  } catch (error: any) {
    if (signal?.aborted) return { $: null, html: '' };
    console.warn(`[SiteScraper:p4455] Failed to load ${url}:`, error?.message || error);
  }
  return { $: null, html: '' };
}

async function extractPostLinksFromPage(
  pageUrl: string,
  signal?: AbortSignal
): Promise<string[]> {
  const { $, html } = await fetchSoup(pageUrl, signal);
  if (!$) return [];

  const postUrls: string[] = [];
  const seen = new Set<string>();

  let videoBlocks = $('div.video-block');
  if (videoBlocks.length === 0) {
    videoBlocks = $('article');
  }

  videoBlocks.each((_, el) => {
    if (signal?.aborted) return;
    const aTag = $(el).find('a[href]').first();
    const href = aTag.attr('href');
    if (!href) return;

    try {
      const fullUrl = new URL(href, BASE_DOMAIN).href;
      if (!seen.has(fullUrl) && !fullUrl.includes('/tag/') && !fullUrl.includes('/category/')) {
        seen.add(fullUrl);
        postUrls.push(fullUrl);
      }
    } catch {}
  });

  if (postUrls.length === 0) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/page/') || href.includes('wp-content')) return;
      try {
        const fullUrl = new URL(href, BASE_DOMAIN).href;
        if (fullUrl !== BASE_DOMAIN && fullUrl !== `${BASE_DOMAIN}/` && !seen.has(fullUrl)) {
          seen.add(fullUrl);
          postUrls.push(fullUrl);
        }
      } catch {}
    });
  }

  return postUrls;
}

function categorizeMp4Links(mp4List: string[]): { link720p: string | null; link480p: string | null } {
  let link720p: string | null = null;
  let link480p: string | null = null;

  for (const link of mp4List) {
    if (link.toLowerCase().includes('_480p')) {
      link480p = link;
    } else {
      link720p = link;
    }
  }

  return { link720p, link480p };
}

async function create16by9GridBuffer(imageUrls: string[], signal?: AbortSignal): Promise<Buffer | null> {
  if (!imageUrls || imageUrls.length === 0) return null;

  const imageBuffers: Buffer[] = [];
  for (const url of imageUrls) {
    if (signal?.aborted) break;
    try {
      let resp = await axios.get(url, {
        headers: HEADERS,
        responseType: 'arraybuffer',
        timeout: 8000,
        signal,
      });

      if (resp.status === 200 && resp.data) {
        imageBuffers.push(Buffer.from(resp.data));
      } else {
        // Fallback for single digit frame format
        let altUrl = url;
        if (url.includes('_0')) {
          altUrl = url.replace('_0', '_');
        } else {
          const m = url.match(/\/frame_(\d+)\.jpg/);
          if (m) {
            altUrl = url.replace(m[0], `/frame_${String(m[1]).padStart(2, '0')}.jpg`);
          }
        }

        if (altUrl !== url) {
          resp = await axios.get(altUrl, {
            headers: HEADERS,
            responseType: 'arraybuffer',
            timeout: 8000,
            signal,
          });
          if (resp.status === 200 && resp.data) {
            imageBuffers.push(Buffer.from(resp.data));
          }
        }
      }
    } catch {}
  }

  if (imageBuffers.length === 0) return null;

  try {
    const canvasWidth = 1920;
    const canvasHeight = 1080;

    let cols = 5;
    let rows = 2;
    if (imageBuffers.length >= 9) {
      cols = 3;
      rows = 3;
    } else if (imageBuffers.length >= 6) {
      cols = 3;
      rows = 2;
    }

    const cellW = Math.floor(canvasWidth / cols);
    const cellH = Math.floor(canvasHeight / rows);
    const maxItems = cols * rows;

    const composites: Array<{ input: Buffer; left: number; top: number }> = [];

    for (let idx = 0; idx < Math.min(imageBuffers.length, maxItems); idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const resizedCell = await sharp(imageBuffers[idx])
        .resize(cellW, cellH, { fit: 'cover' })
        .toBuffer();

      composites.push({
        input: resizedCell,
        left: col * cellW,
        top: row * cellH,
      });
    }

    const finalGrid = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 95 })
      .toBuffer();

    return finalGrid;
  } catch (err: any) {
    console.warn('[SiteScraper:p4455] Failed to generate frame grid image:', err?.message || err);
    // Fallback: return the first frame image directly
    try {
      return await sharp(imageBuffers[0])
        .resize(1280, 720, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch {
      return null;
    }
  }
}

async function extractMediaFromPost(
  url: string,
  signal?: AbortSignal
): Promise<{
  title: string;
  link720p: string | null;
  link480p: string | null;
  allLinks: string[];
  frameUrls: string[];
  videoId: string;
  duration: string;
}> {
  const { $, html } = await fetchSoup(url, signal);
  if (!$) {
    return {
      title: 'Untitled',
      link720p: null,
      link480p: null,
      allLinks: [],
      frameUrls: [],
      videoId: String(Date.now()),
      duration: 'Unknown',
    };
  }

  let rawTitle = 'Untitled';
  const pageTitle = $('title').text();
  if (pageTitle) {
    rawTitle = pageTitle.trim();
  }
  const title = cleanTitle(rawTitle);

  const mp4Links = new Set<string>();
  $('video, source').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.toLowerCase().includes('.mp4')) {
      try {
        mp4Links.add(new URL(src, url).href);
      } catch {
        mp4Links.add(src);
      }
    }
  });

  const regexMp4 = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
  const matches = html.match(regexMp4) || [];
  for (const m of matches) {
    mp4Links.add(m);
  }

  const mp4List = Array.from(mp4Links);
  const { link720p, link480p } = categorizeMp4Links(mp4List);

  let duration = 'Unknown';
  const durMeta =
    $('meta[property*="duration" i]').attr('content') ||
    $('meta[itemprop="duration"]').attr('content');

  if (durMeta) {
    const ptMatch = durMeta.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (ptMatch) {
      const h = parseInt(ptMatch[1] || '0', 10);
      const m = parseInt(ptMatch[2] || '0', 10);
      const s = parseInt(ptMatch[3] || '0', 10);
      duration =
        h > 0
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      duration = durMeta.trim();
    }
  } else {
    const textMatch = html.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if (textMatch) {
      duration = textMatch[1];
    }
  }

  let videoId: string | null = null;
  for (const mLink of mp4List) {
    const m = mLink.match(/\/(\d+)(?:_\w+)?\.mp4/i);
    if (m) {
      videoId = m[1];
      break;
    }
  }
  if (!videoId) {
    videoId = String(Math.floor(Date.now() / 1000));
  }

  const frameUrlsSet = new Set<string>();

  $('div.full-image img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && (src.includes('pview') || src.includes('frame_'))) {
      frameUrlsSet.add(src);
    }
  });

  if (frameUrlsSet.size === 0) {
    const regexFrames = /https?:\/\/[^\s"'<>]+\/pview\/\d+\/frame_\d+\.jpg/gi;
    const fMatches = html.match(regexFrames) || [];
    for (const f of fMatches) {
      frameUrlsSet.add(f);
    }
  }

  if (frameUrlsSet.size === 0 && videoId) {
    const basePviewMatch = html.match(new RegExp(`(https?:\\/\\/[^\\s"'<>]+\\/pview\\/${videoId})`, 'i'));
    if (basePviewMatch) {
      const baseUrl = basePviewMatch[1];
      for (let i = 1; i <= 10; i++) {
        frameUrlsSet.add(`${baseUrl}/frame_${String(i).padStart(2, '0')}.jpg`);
      }
    }
  }

  const frameUrls = Array.from(frameUrlsSet).sort();

  return {
    title,
    link720p,
    link480p,
    allLinks: mp4List,
    frameUrls,
    videoId,
    duration,
  };
}

async function processAndSavePost(
  postUrl: string,
  signal?: AbortSignal
): Promise<boolean> {
  await connectToDatabase();

  const existing = await PostModel.findOne({ post_url: postUrl }).lean();
  let isDataIncomplete = false;

  if (existing) {
    const doc = existing as any;
    if (doc.duration === 'Unknown' || (!doc['720p_link'] && !doc['480p_link'])) {
      isDataIncomplete = true;
    } else {
      return false;
    }
  }

  if (signal?.aborted) return false;

  console.log(`[SiteScraper:p4455] Processing post: ${postUrl}`);
  const media = await extractMediaFromPost(postUrl, signal);

  if (!media.link720p && !media.link480p && media.allLinks.length === 0) {
    console.warn(`[SiteScraper:p4455] No valid MP4 links found for: ${postUrl}`);
    return false;
  }

  let finalThumbnailUrl: string | null = (existing as any)?.thumbnail_url || null;

  if (media.frameUrls.length > 0 && (!finalThumbnailUrl || isDataIncomplete)) {
    try {
      const gridBuffer = await create16by9GridBuffer(media.frameUrls, signal);
      if (gridBuffer) {
        const filename = `${media.videoId}_thumb.jpg`;
        const r2Path = `thumbnails/${filename}`;
        const uploadedUrl = await uploadThumbnailToR2(gridBuffer, r2Path);
        if (uploadedUrl) {
          finalThumbnailUrl = uploadedUrl;
          console.log(`[SiteScraper:p4455] Thumbnail grid uploaded: ${uploadedUrl}`);
        }
      }
    } catch (e: any) {
      console.warn(`[SiteScraper:p4455] Frame grid creation failed for ${postUrl}:`, e?.message || e);
    }
  }

  const postDocument = {
    site: SITE_NAME,
    domain: CURRENT_DOMAIN,
    post_url: postUrl,
    video_id: media.videoId,
    title: media.title,
    duration: media.duration,
    '720p_link': media.link720p,
    '480p_link': media.link480p,
    all_links: media.allLinks,
    thumbnail_url: finalThumbnailUrl,
    views: (existing as any)?.views || 0,
    scraped_at: Math.floor(Date.now() / 1000),
  };

  try {
    await PostModel.updateOne({ post_url: postUrl }, { $set: postDocument }, { upsert: true });
    console.log(`[SiteScraper:p4455] Saved: "${media.title}" (${media.duration})`);
    return true;
  } catch (err: any) {
    console.error(`[SiteScraper:p4455] MongoDB save failed:`, err?.message || err);
    return false;
  }
}

export async function runP4455IncrementalScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:p4455] Starting incremental latest scan on: ${START_PAGE_URL}`);
  await connectToDatabase();

  const postUrls = await extractPostLinksFromPage(START_PAGE_URL, signal);
  let newPosts = 0;
  let failed = 0;

  for (const url of postUrls) {
    if (signal?.aborted) {
      console.log(`[SiteScraper:p4455] Incremental scan aborted.`);
      break;
    }

    const exists = await PostModel.findOne({ post_url: url }).lean();
    if (exists && (exists as any).duration !== 'Unknown' && ((exists as any)['720p_link'] || (exists as any)['480p_link'])) {
      continue;
    }

    try {
      const ok = await processAndSavePost(url, signal);
      if (ok) {
        newPosts++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`[SiteScraper:p4455] Scan complete. ${newPosts} new posts saved, ${failed} failed.`);
  return { newPosts, failed };
}

export async function runP4455FullScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:p4455] Starting full scan...`);
  await connectToDatabase();

  let pageNum = 1;
  let newPosts = 0;
  let failed = 0;

  while (!signal?.aborted) {
    const pageUrl = pageNum === 1 ? START_PAGE_URL : `${BASE_DOMAIN}/latest/page/${pageNum}/`;
    console.log(`[SiteScraper:p4455] Fetching Page ${pageNum}: ${pageUrl}`);

    const postUrls = await extractPostLinksFromPage(pageUrl, signal);
    if (!postUrls || postUrls.length === 0) {
      console.log(`[SiteScraper:p4455] No more posts found at page ${pageNum}. Scan complete.`);
      break;
    }

    let pageNewCount = 0;
    for (const url of postUrls) {
      if (signal?.aborted) break;

      try {
        const ok = await processAndSavePost(url, signal);
        if (ok) {
          newPosts++;
          pageNewCount++;
        }
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    pageNum++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { newPosts, failed };
}

export const p4455ScraperModule: SiteScraperModule = {
  id: 'p4455',
  name: 'p4455.com',
  domain: CURRENT_DOMAIN,
  baseUrl: BASE_DOMAIN,
  defaultSchedule: 'Daily at 02:00',
  scheduleHour: 2,
  runIncremental: runP4455IncrementalScan,
  runFullScan: runP4455FullScan,
};
