import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2PublicUrl } from '../r2Helper.js';
import { connectToDatabase, PostModel } from '../../lib/mongodb.js';
import { SiteScraperModule } from './types.js';

const BASE_DOMAIN = 'https://www.xxxindianstories.com';
const START_PAGE_URL = `${BASE_DOMAIN}/videos/latest-updates/`;
const CURRENT_DOMAIN = 'www.xxxindianstories.com';
const SITE_NAME = 'xxxindianstories';

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return 'Untitled';
  const cleaned = rawTitle.replace(/[\s\-\–|]*xxxindianstories.*$/i, '').trim();
  return cleaned || rawTitle.trim();
}

function constructCdnMp4Url(rawUrl: string): string {
  const match = rawUrl.match(/(\d+\/\d+\/\d+\.mp4)/i);
  if (match) {
    return `https://cdn.xxxindianstories.com/${match[1]}`;
  }
  let cleanUrl = rawUrl.split('?')[0];
  cleanUrl = cleanUrl.replace(
    /https?:\/\/(www\.)?xxxindianstories\.com\/videos\/(get_file\/\d+\/[a-f0-9]+\/)?/i,
    'https://cdn.xxxindianstories.com/'
  );
  return cleanUrl;
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
    console.error(`[SiteScraper:xxxindianstories] Cloudflare R2 Upload Error (${r2Path}):`, error?.message || error);
    return null;
  }
}

async function fetchSoup(url: string, signal?: AbortSignal): Promise<{ $: cheerio.CheerioAPI | null; html: string }> {
  try {
    const customHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${BASE_DOMAIN}/videos/latest-updates/`,
      'X-Requested-With': 'XMLHttpRequest',
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
    console.warn(`[SiteScraper:xxxindianstories] Failed to load ${url}:`, error?.message || error);
  }
  return { $: null, html: '' };
}

async function extractPostsInfoFromPage(
  pageUrl: string,
  pageNum: number,
  signal?: AbortSignal
): Promise<Array<{ url: string; duration: string; posterUrl: string | null }>> {
  const targetUrl = pageNum === 1 ? pageUrl : `${pageUrl}?from=${pageNum}`;
  const { $, html } = await fetchSoup(targetUrl, signal);
  if (!$) return [];

  const postsData: Array<{ url: string; duration: string; posterUrl: string | null }> = [];
  const seenUrls = new Set<string>();

  let items = $('section#list_videos_most_recent_videos div.thumb_rel, section#list_videos_most_recent_videos div[class*="thumb_rel" i]');
  if (items.length === 0) {
    items = $('div.thumb_rel, div[class*="thumb_rel" i]');
  }
  if (items.length === 0) {
    items = $('section#list_videos_most_recent_videos div.thumb, section#list_videos_most_recent_videos div[class*="thumb" i]');
  }
  if (items.length === 0) {
    items = $('div.thumb, div[class*="thumb" i]');
  }

  items.each((_, el) => {
    if (signal?.aborted) return;
    const item = $(el);
    const aTag = item.find('a[href]').first();
    const href = aTag.attr('href');
    if (!href) return;

    let fullUrl = href;
    try {
      fullUrl = new URL(href, BASE_DOMAIN).href;
    } catch {
      return;
    }

    if (['/tag/', '/category/', '/author/', 'wp-json'].some((x) => fullUrl.includes(x))) {
      return;
    }

    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    let duration = 'Unknown';
    const timeDiv = item.find('div.time');
    if (timeDiv.length > 0 && timeDiv.text().trim()) {
      duration = timeDiv.text().trim();
    }

    let posterUrl: string | null = null;
    const imgTag = item.find('img').first();
    if (imgTag.length > 0) {
      const rawPoster = imgTag.attr('data-webp') || imgTag.attr('src');
      if (rawPoster) {
        try {
          posterUrl = new URL(rawPoster, BASE_DOMAIN).href;
        } catch {
          posterUrl = rawPoster;
        }
      }
    }

    postsData.push({ url: fullUrl, duration, posterUrl });
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
      const cdnLink = constructCdnMp4Url(src);
      if (!cdnLink.includes('preview.mp4')) {
        mp4Links.add(cdnLink);
      }
    }
  });

  const regexMp4 = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
  const matches = html.match(regexMp4) || [];
  for (const m of matches) {
    if (!m.includes('preview.mp4')) {
      const cdnLink = constructCdnMp4Url(m);
      mp4Links.add(cdnLink);
    }
  }

  const mp4List = Array.from(mp4Links);
  const { link720p, link480p } = categorizeMp4Links(mp4List);

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
    videoId,
    duration,
  };
}

async function processAndSavePost(
  postUrl: string,
  pageDuration: string,
  pagePosterUrl: string | null,
  signal?: AbortSignal
): Promise<boolean> {
  await connectToDatabase();

  const existing = await PostModel.findOne({ post_url: postUrl }).lean();
  let isDataIncomplete = false;

  if (existing) {
    const doc = existing as any;
    if (
      doc.duration === 'Unknown' ||
      (!doc['720p_link'] && !doc['480p_link']) ||
      !doc.thumbnail_url ||
      String(doc['720p_link'] || '').includes('get_file')
    ) {
      isDataIncomplete = true;
    } else {
      return false;
    }
  }

  if (signal?.aborted) return false;

  console.log(`[SiteScraper:xxxindianstories] Processing post: ${postUrl}`);
  const media = await extractMediaFromPost(postUrl, signal);

  if (!media.link720p && !media.link480p && media.allLinks.length === 0) {
    console.warn(`[SiteScraper:xxxindianstories] No valid stream links found for: ${postUrl}`);
    return false;
  }

  const duration = pageDuration !== 'Unknown' ? pageDuration : media.duration;

  let finalThumbnailUrl: string | null = (existing as any)?.thumbnail_url || null;

  if (pagePosterUrl && (!finalThumbnailUrl || isDataIncomplete)) {
    try {
      const imgResp = await axios.get(pagePosterUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `${BASE_DOMAIN}/videos/latest-updates/`,
        },
      });

      if (imgResp.status === 200 && imgResp.data) {
        const processedBuffer = await sharp(Buffer.from(imgResp.data))
          .resize(1280, 1280, { fit: 'inside' })
          .jpeg({ quality: 95 })
          .toBuffer();

        const filename = `${media.videoId}_thumb.jpg`;
        const r2Path = `thumbnails/${filename}`;
        const uploadedUrl = await uploadThumbnailToR2(processedBuffer, r2Path);
        if (uploadedUrl) {
          finalThumbnailUrl = uploadedUrl;
        }
      }
    } catch (e: any) {
      console.warn(`[SiteScraper:xxxindianstories] Poster download failed for ${postUrl}:`, e?.message || e);
    }
  }

  const postDocument = {
    site: SITE_NAME,
    domain: CURRENT_DOMAIN,
    post_url: postUrl,
    video_id: media.videoId,
    title: media.title,
    duration,
    video_url: media.link720p || media.link480p || media.allLinks[0] || null,
    video_url1: media.link480p || null,
    video_url2: media.link720p || null,
    '720p_link': media.link720p,
    '480p_link': media.link480p,
    all_links: media.allLinks,
    thumbnail_url: finalThumbnailUrl,
    views: (existing as any)?.views || 0,
    scraped_at: Math.floor(Date.now() / 1000),
  };

  try {
    await PostModel.updateOne({ post_url: postUrl }, { $set: postDocument }, { upsert: true });
    console.log(`[SiteScraper:xxxindianstories] Saved: "${media.title}" (${duration})`);
    return true;
  } catch (err: any) {
    console.error(`[SiteScraper:xxxindianstories] MongoDB save failed:`, err?.message || err);
    return false;
  }
}

export async function runXxxindianstoriesIncrementalScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:xxxindianstories] Starting incremental latest scan on: ${START_PAGE_URL}`);
  await connectToDatabase();

  const postsData = await extractPostsInfoFromPage(START_PAGE_URL, 1, signal);
  let newPosts = 0;
  let failed = 0;

  for (const post of postsData) {
    if (signal?.aborted) {
      console.log(`[SiteScraper:xxxindianstories] Incremental scan aborted.`);
      break;
    }

    const exists = await PostModel.findOne({ post_url: post.url }).lean();
    if (
      exists &&
      (exists as any).duration !== 'Unknown' &&
      ((exists as any)['720p_link'] || (exists as any)['480p_link']) &&
      (exists as any).thumbnail_url &&
      !String((exists as any)['720p_link'] || '').includes('get_file')
    ) {
      continue;
    }

    try {
      const ok = await processAndSavePost(post.url, post.duration, post.posterUrl, signal);
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

  console.log(`[SiteScraper:xxxindianstories] Scan complete. ${newPosts} new posts saved, ${failed} failed.`);
  return { newPosts, failed };
}

export async function runXxxindianstoriesFullScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:xxxindianstories] Starting full scan...`);
  await connectToDatabase();

  let pageNum = 1;
  let newPosts = 0;
  let failed = 0;

  while (!signal?.aborted) {
    console.log(`[SiteScraper:xxxindianstories] Fetching Page ${pageNum}...`);

    const postsData = await extractPostsInfoFromPage(START_PAGE_URL, pageNum, signal);
    if (!postsData || postsData.length === 0) {
      console.log(`[SiteScraper:xxxindianstories] No more posts found at page ${pageNum}. Scan complete.`);
      break;
    }

    let pageNewCount = 0;
    for (const post of postsData) {
      if (signal?.aborted) break;

      try {
        const ok = await processAndSavePost(post.url, post.duration, post.posterUrl, signal);
        if (ok) {
          newPosts++;
          pageNewCount++;
        }
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (pageNewCount === 0 && pageNum > 1) {
      console.log(`[SiteScraper:xxxindianstories] No new posts found on page ${pageNum}. Scan complete.`);
      break;
    }

    pageNum++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { newPosts, failed };
}

export const xxxindianstoriesScraperModule: SiteScraperModule = {
  id: 'xxxindianstories',
  name: 'xxxindianstories.com',
  domain: CURRENT_DOMAIN,
  baseUrl: BASE_DOMAIN,
  defaultSchedule: 'Daily at 09:00',
  scheduleHour: 9,
  runIncremental: runXxxindianstoriesIncrementalScan,
  runFullScan: runXxxindianstoriesFullScan,
};
