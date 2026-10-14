import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2PublicUrl } from '../r2Helper.js';
import { connectToDatabase, PostModel } from '../../lib/mongodb.js';
import { SiteScraperModule } from './types.js';

const BASE_DOMAIN = 'https://mydesi.rest';
const START_PAGE_URL = `${BASE_DOMAIN}/`;
const CURRENT_DOMAIN = 'mydesi.rest';
const SITE_NAME = 'mydesi';

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return 'Untitled';
  const cleaned = rawTitle.replace(/[\s\-\–|]*mydesi.*$/i, '').trim();
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
    console.error(`[SiteScraper:mydesirest] Cloudflare R2 Upload Error (${r2Path}):`, error?.message || error);
    return null;
  }
}

async function processThumbnailBuffer(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const bg = await sharp(imageBuffer)
      .resize(1920, 1080, { fit: 'cover' })
      .blur(25)
      .toBuffer();

    const fg = await sharp(imageBuffer)
      .resize(1920, 1080, { fit: 'inside' })
      .toBuffer();

    const metadata = await sharp(fg).metadata();
    const fgW = metadata.width || 1920;
    const fgH = metadata.height || 1080;
    const left = Math.max(0, Math.floor((1920 - fgW) / 2));
    const top = Math.max(0, Math.floor((1080 - fgH) / 2));

    return await sharp(bg)
      .composite([{ input: fg, left, top }])
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch {
    return imageBuffer;
  }
}

async function fetchSoup(url: string, signal?: AbortSignal): Promise<{ $: cheerio.CheerioAPI | null; html: string }> {
  try {
    const customHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${BASE_DOMAIN}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const resp = await axios.get(url, {
      headers: customHeaders,
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
    console.warn(`[SiteScraper:mydesirest] Failed to load ${url}:`, error?.message || error);
  }
  return { $: null, html: '' };
}

async function extractPostsInfoFromPage(
  pageUrl: string,
  signal?: AbortSignal
): Promise<Array<{ url: string; duration: string }>> {
  const { $, html } = await fetchSoup(pageUrl, signal);
  if (!$) return [];

  const postsData: Array<{ url: string; duration: string }> = [];
  const seenUrls = new Set<string>();

  let links = $('a.thumb, a.infos, a[class*="thumb" i], a[class*="infos" i]');
  if (links.length === 0) {
    links = $('a[href]');
  }

  links.each((_, el) => {
    if (signal?.aborted) return;
    const href = $(el).attr('href');
    if (!href) return;

    let fullUrl = href;
    try {
      fullUrl = new URL(href, BASE_DOMAIN).href;
    } catch {
      return;
    }

    if (['/wp-content/', '/tag/', '/category/', '/author/', 'wp-json', '#'].some((x) => fullUrl.includes(x))) {
      return;
    }

    if (fullUrl === BASE_DOMAIN || fullUrl === `${BASE_DOMAIN}/`) {
      return;
    }

    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    let duration = 'Unknown';
    const text = $(el).text().trim();
    const match = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (match) {
      duration = match[1];
    }

    postsData.push({ url: fullUrl, duration });
  });

  return postsData;
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

async function extractMediaFromPost(
  postUrl: string,
  signal?: AbortSignal
): Promise<{
  title: string;
  link720p: string | null;
  link480p: string | null;
  allLinks: string[];
  posterUrl: string | null;
  videoId: string;
  duration: string;
}> {
  const { $, html } = await fetchSoup(postUrl, signal);
  if (!$) {
    return {
      title: 'Untitled',
      link720p: null,
      link480p: null,
      allLinks: [],
      posterUrl: null,
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

  // 1. itemprop="contentUrl"
  const contentUrlMeta = $('meta[itemprop="contentUrl"]').attr('content');
  if (contentUrlMeta) {
    try {
      mp4Links.add(new URL(contentUrlMeta, postUrl).href);
    } catch {
      mp4Links.add(contentUrlMeta);
    }
  }

  // 2. Video / Source tags
  $('video, source').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.toLowerCase().includes('.mp4')) {
      try {
        mp4Links.add(new URL(src, postUrl).href);
      } catch {
        mp4Links.add(src);
      }
    }
  });

  // 3. Regex mp4 matches
  const regexMp4 = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
  const matches = html.match(regexMp4) || [];
  for (const m of matches) {
    mp4Links.add(m);
  }

  const mp4List = Array.from(mp4Links);
  const { link720p, link480p } = categorizeMp4Links(mp4List);

  let posterUrl: string | null = null;
  const thumbMeta = $('meta[itemprop="thumbnailUrl"]').attr('content');
  if (thumbMeta) {
    posterUrl = thumbMeta;
  }
  if (!posterUrl) {
    const videoTagPoster = $('video[poster]').attr('poster');
    if (videoTagPoster) posterUrl = videoTagPoster;
  }
  if (!posterUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) posterUrl = ogImage;
  }

  let duration = 'Unknown';
  const durMeta =
    $('meta[itemprop="duration"]').attr('content') ||
    $('meta[property*="duration" i]').attr('content');

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
    const textMatch = html.match(/\b(\d{2}:\d{2}(?::\d{2})?)\b/);
    if (textMatch) {
      duration = textMatch[1];
    }
  }

  let videoId: string | null = null;
  for (const mLink of mp4List) {
    const m = mLink.match(/\/([\w\-]+)\.mp4/i);
    if (m) {
      videoId = m[1];
      break;
    }
  }
  if (!videoId) {
    videoId = String(Math.floor(Date.now() / 1000));
  }

  return {
    title,
    link720p,
    link480p,
    allLinks: mp4List,
    posterUrl,
    videoId,
    duration,
  };
}

async function processAndSavePost(
  postUrl: string,
  pageDuration: string,
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

  console.log(`[SiteScraper:mydesirest] Processing post: ${postUrl}`);
  const media = await extractMediaFromPost(postUrl, signal);

  if (!media.link720p && !media.link480p && media.allLinks.length === 0) {
    console.warn(`[SiteScraper:mydesirest] No valid stream links found for: ${postUrl}`);
    return false;
  }

  const duration = pageDuration !== 'Unknown' ? pageDuration : media.duration;

  let finalThumbnailUrl: string | null = (existing as any)?.thumbnail_url || null;

  if (media.posterUrl && (!finalThumbnailUrl || isDataIncomplete)) {
    try {
      const imgResp = await axios.get(media.posterUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `${BASE_DOMAIN}/`,
        },
      });

      if (imgResp.status === 200 && imgResp.data) {
        const processedBuffer = await processThumbnailBuffer(Buffer.from(imgResp.data));
        const filename = `${media.videoId}_thumb.jpg`;
        const r2Path = `thumbnails/${filename}`;
        const uploadedUrl = await uploadThumbnailToR2(processedBuffer, r2Path);
        if (uploadedUrl) {
          finalThumbnailUrl = uploadedUrl;
        }
      }
    } catch (e: any) {
      console.warn(`[SiteScraper:mydesirest] Poster download failed for ${postUrl}:`, e?.message || e);
    }
  }

  const postDocument = {
    site: SITE_NAME,
    domain: CURRENT_DOMAIN,
    post_url: postUrl,
    video_id: media.videoId,
    title: media.title,
    duration,
    '720p_link': media.link720p,
    '480p_link': media.link480p,
    all_links: media.allLinks,
    thumbnail_url: finalThumbnailUrl,
    views: (existing as any)?.views || 0,
    scraped_at: Math.floor(Date.now() / 1000),
  };

  try {
    await PostModel.updateOne({ post_url: postUrl }, { $set: postDocument }, { upsert: true });
    console.log(`[SiteScraper:mydesirest] Saved: "${media.title}" (${duration})`);
    return true;
  } catch (err: any) {
    console.error(`[SiteScraper:mydesirest] MongoDB save failed:`, err?.message || err);
    return false;
  }
}

export async function runMydesiRestIncrementalScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:mydesirest] Starting incremental latest scan on: ${START_PAGE_URL}`);
  await connectToDatabase();

  const postsData = await extractPostsInfoFromPage(START_PAGE_URL, signal);
  let newPosts = 0;
  let failed = 0;

  for (const post of postsData) {
    if (signal?.aborted) {
      console.log(`[SiteScraper:mydesirest] Incremental scan aborted.`);
      break;
    }

    const exists = await PostModel.findOne({ post_url: post.url }).lean();
    if (exists && (exists as any).duration !== 'Unknown' && ((exists as any)['720p_link'] || (exists as any)['480p_link'])) {
      continue;
    }

    try {
      const ok = await processAndSavePost(post.url, post.duration, signal);
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

  console.log(`[SiteScraper:mydesirest] Scan complete. ${newPosts} new posts saved, ${failed} failed.`);
  return { newPosts, failed };
}

export async function runMydesiRestFullScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:mydesirest] Starting full scan...`);
  await connectToDatabase();

  let pageNum = 1;
  let newPosts = 0;
  let failed = 0;

  while (!signal?.aborted) {
    const pageUrl = pageNum === 1 ? START_PAGE_URL : `${BASE_DOMAIN}/page/${pageNum}/`;
    console.log(`[SiteScraper:mydesirest] Fetching Page ${pageNum}: ${pageUrl}`);

    const postsData = await extractPostsInfoFromPage(pageUrl, signal);
    if (!postsData || postsData.length === 0) {
      console.log(`[SiteScraper:mydesirest] No more posts found at page ${pageNum}. Scan complete.`);
      break;
    }

    let pageNewCount = 0;
    for (const post of postsData) {
      if (signal?.aborted) break;

      try {
        const ok = await processAndSavePost(post.url, post.duration, signal);
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

export const mydesiRestScraperModule: SiteScraperModule = {
  id: 'mydesirest',
  name: 'mydesi.rest',
  domain: CURRENT_DOMAIN,
  baseUrl: BASE_DOMAIN,
  defaultSchedule: 'Daily at 05:00',
  scheduleHour: 5,
  runIncremental: runMydesiRestIncrementalScan,
  runFullScan: runMydesiRestFullScan,
};
