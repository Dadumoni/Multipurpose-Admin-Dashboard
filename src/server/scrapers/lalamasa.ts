import axios from 'axios';
import * as cheerio from 'cheerio';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2PublicUrl } from '../r2Helper.js';
import { connectToDatabase, PostModel } from '../../lib/mongodb.js';
import { SiteScraperModule } from './types.js';

const BASE_DOMAIN = 'https://lalamasa.mobi';
const START_PAGE_URL = `${BASE_DOMAIN}/latest/`;
const CURRENT_DOMAIN = 'lalamasa.mobi';
const SITE_NAME = 'lalamasa';

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return 'Untitled';
  const cleaned = rawTitle.replace(/[\s\-\–|]*lalamasa.*$/i, '').trim();
  return cleaned || rawTitle.trim();
}

async function uploadImageBytesToR2(imageBuffer: Buffer, r2Path: string): Promise<string | null> {
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

    const publicUrl = getR2PublicUrl(r2Path);
    return publicUrl;
  } catch (error: any) {
    console.error(`[SiteScraper:lalamasa] Cloudflare R2 Upload Error (${r2Path}):`, error?.message || error);
    return null;
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
    } else {
      console.warn(`[SiteScraper:lalamasa] Non-200 status code received: ${resp.status} for ${url}`);
    }
  } catch (error: any) {
    if (signal?.aborted) return { $: null, html: '' };
    console.warn(`[SiteScraper:lalamasa] Failed to load ${url}:`, error?.message || error);
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

  // Matches article.vcard elements inside grid as specified in extraction logic
  const selector = $('article.vcard').length > 0 ? 'article.vcard' : 'article';
  const articles = $(selector);

  articles.each((_, el) => {
    if (signal?.aborted) return;
    const article = $(el);
    let aTag: cheerio.Cheerio<any> = article.find('a[href]').first();
    if (aTag.length === 0) {
      aTag = article.closest('a[href]');
    }
    if (aTag.length === 0) {
      aTag = article.next('a[href]');
    }

    const href = aTag.attr('href');
    if (!href) return;

    let fullUrl = href;
    try {
      fullUrl = new URL(href, BASE_DOMAIN).href;
    } catch {
      return;
    }

    if (['/tag/', '/category/', '/author/'].some((x) => fullUrl.includes(x))) {
      return;
    }

    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    let duration = 'Unknown';
    const text = article.text().trim();
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

  // Extract <source src="..."> or <video src="..."> tags
  $('source, video').each((_, el) => {
    const src = $(el).attr('src');
    if (src && (src.toLowerCase().includes('.mp4') || src.includes('mydown.biz') || src.includes('myfiles'))) {
      try {
        mp4Links.add(new URL(src, postUrl).href);
      } catch {}
    }
  });

  // Regex fallback across raw html
  const regexMp4 = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
  const matches = html.match(regexMp4) || [];
  for (const m of matches) {
    mp4Links.add(m);
  }

  const mp4List = Array.from(mp4Links);
  const { link720p, link480p } = categorizeMp4Links(mp4List);

  // Poster / thumbnail
  let posterUrl: string | null = null;
  const videoTagPoster = $('video[poster]').attr('poster');
  if (videoTagPoster) {
    posterUrl = videoTagPoster;
  }
  if (!posterUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      posterUrl = ogImage;
    }
  }

  // Duration
  let duration = 'Unknown';
  const durationMeta = $('meta[property*="duration" i]').attr('content');
  if (durationMeta && durationMeta.trim()) {
    duration = durationMeta.trim();
  } else {
    const match = html.match(/\b(\d{2}:\d{2}(?::\d{2})?)\b/);
    if (match) {
      duration = match[1];
    }
  }

  // Video ID
  let videoId: string | null = null;
  for (const mLink of mp4List) {
    const match = mLink.match(/\/([\w-]+)\.mp4/);
    if (match) {
      videoId = match[1];
      break;
    }
  }
  if (!videoId) {
    videoId = String(Date.now());
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
  if (signal?.aborted) return false;

  await connectToDatabase();
  const existingPost: any = await PostModel.findOne({ post_url: postUrl }).lean();

  let isDataIncomplete = false;
  if (existingPost) {
    if (
      existingPost.duration === 'Unknown' ||
      (!existingPost['720p_link'] && !existingPost['480p_link'])
    ) {
      isDataIncomplete = true;
    } else {
      return false; // Skip already complete post
    }
  }

  console.log(`[SiteScraper:lalamasa] Processing post: ${postUrl}`);
  const media = await extractMediaFromPost(postUrl, signal);

  if (!media.link720p && !media.link480p && media.allLinks.length === 0) {
    console.warn(`[SiteScraper:lalamasa] No valid video links found for: ${postUrl}`);
    return false;
  }

  const duration = pageDuration !== 'Unknown' ? pageDuration : media.duration;

  let thumbnailUrl = existingPost?.thumbnail_url || null;
  if (media.posterUrl && (!thumbnailUrl || isDataIncomplete)) {
    try {
      const imgResp = await axios.get(media.posterUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Referer': `${BASE_DOMAIN}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
        signal,
      });

      if (imgResp.status === 200 && imgResp.data) {
        const filename = `${media.videoId}_thumb.jpg`;
        const r2Path = `thumbnails/${filename}`;
        thumbnailUrl = await uploadImageBytesToR2(Buffer.from(imgResp.data), r2Path);
      }
    } catch (err: any) {
      if (!signal?.aborted) {
        console.warn(`[SiteScraper:lalamasa] Poster image download notice for ${postUrl}:`, err?.message || err);
      }
    }
  }

  const effectiveStream = media.link720p || media.link480p || media.allLinks[0] || null;

  const postDocument = {
    id: existingPost?.id || Date.now(),
    site: SITE_NAME,
    domain: CURRENT_DOMAIN,
    post_url: postUrl,
    video_id: media.videoId,
    title: media.title,
    duration,
    video_url: effectiveStream,
    '720p_link': media.link720p,
    '480p_link': media.link480p,
    video_url1: media.link480p,
    video_url2: media.link720p,
    all_links: media.allLinks,
    thumbnail_url: thumbnailUrl,
    views: existingPost?.views || 0,
    scraped_at: new Date(),
    created_at: existingPost?.created_at || new Date(),
  };

  try {
    await PostModel.updateOne({ post_url: postUrl }, { $set: postDocument }, { upsert: true });
    console.log(`[SiteScraper:lalamasa] [Success] Successfully Saved: "${media.title}" (${duration})`);
    return true;
  } catch (e: any) {
    console.error(`[SiteScraper:lalamasa] MongoDB Save Error for ${postUrl}:`, e?.message || e);
    return false;
  }
}

/**
 * Scheduled incremental run:
 * Checks START_PAGE_URL (https://lalamasa.mobi/latest/) for new posts at 00:00.
 * Does not re-crawl the whole site.
 */
export async function runLalamasaIncrementalScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:lalamasa] Starting scheduled scan for new posts: ${START_PAGE_URL}`);
  let newPosts = 0;
  let failed = 0;

  try {
    const postsData = await extractPostsInfoFromPage(START_PAGE_URL, signal);
    console.log(`[SiteScraper:lalamasa] Found ${postsData.length} items on latest page.`);

    for (const postInfo of postsData) {
      if (signal?.aborted) {
        console.log('[SiteScraper:lalamasa] Scan aborted by user.');
        break;
      }

      await connectToDatabase();
      const existing = await PostModel.findOne({ post_url: postInfo.url }).lean();
      if (!existing) {
        console.log(`[SiteScraper:lalamasa] New post detected: ${postInfo.url}`);
        const success = await processAndSavePost(postInfo.url, postInfo.duration, signal);
        if (success) {
          newPosts++;
        } else {
          failed++;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    console.log(`[SiteScraper:lalamasa] Scan completed. ${newPosts} new posts saved, ${failed} failed.`);
  } catch (err: any) {
    console.error('[SiteScraper:lalamasa] Error during incremental scan:', err?.message || err);
  }

  return { newPosts, failed };
}

/**
 * Full historical scan (crawl pages 1..N) if requested
 */
export async function runLalamasaFullScan(
  signal?: AbortSignal
): Promise<{ newPosts: number; failed: number }> {
  console.log(`[SiteScraper:lalamasa] Starting full historical crawl: ${START_PAGE_URL}`);
  let newPosts = 0;
  let failed = 0;
  let pageNum = 1;

  while (!signal?.aborted) {
    const currentUrl = pageNum === 1 ? START_PAGE_URL : `${BASE_DOMAIN}/latest/page/${pageNum}/`;
    console.log(`[SiteScraper:lalamasa] [Page ${pageNum}] Fetching: ${currentUrl}`);

    const postsData = await extractPostsInfoFromPage(currentUrl, signal);
    if (!postsData || postsData.length === 0) {
      console.log(`[SiteScraper:lalamasa] No more posts found at page ${pageNum}. Scan complete.`);
      break;
    }

    let pageNewCount = 0;
    for (const postInfo of postsData) {
      if (signal?.aborted) break;
      const success = await processAndSavePost(postInfo.url, postInfo.duration, signal);
      if (success) {
        newPosts++;
        pageNewCount++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[SiteScraper:lalamasa] Page ${pageNum} finished (${pageNewCount} new posts).`);
    pageNum++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { newPosts, failed };
}

export const lalamasaScraperModule: SiteScraperModule = {
  id: 'lalamasa',
  name: 'lalamasa.mobi',
  domain: CURRENT_DOMAIN,
  baseUrl: BASE_DOMAIN,
  defaultSchedule: 'Daily at 00:00',
  scheduleHour: 0,
  runIncremental: runLalamasaIncrementalScan,
  runFullScan: runLalamasaFullScan,
};
