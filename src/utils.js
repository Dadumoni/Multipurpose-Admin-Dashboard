// ─── Slug Generator ────────────────────────────────────────────────────────
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_';

export function generateSlug(length = null) {
  const len = length ?? (15 + Math.floor(Math.random() * 6)); // 15–20
  let slug = '';
  // Ensure starts with letter
  slug += SLUG_CHARS[Math.floor(Math.random() * 26)];
  const array = new Uint8Array(len - 1);
  crypto.getRandomValues(array);
  for (const byte of array) {
    slug += SLUG_CHARS[byte % SLUG_CHARS.length];
  }
  return slug;
}

export async function generateUniqueSlug(db) {
  let slug, exists;
  do {
    slug = generateSlug();
    const row = await db.prepare('SELECT id FROM videos WHERE slug = ?').bind(slug).first();
    exists = !!row;
  } while (exists);
  return slug;
}

// ─── Auth Middleware ────────────────────────────────────────────────────────
export function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  return token === env.ADMIN_TOKEN;
}

// ─── CORS Headers ───────────────────────────────────────────────────────────
export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function error(message, status = 400) {
  return json({ success: false, error: message }, status);
}

export function ok(data = {}) {
  return json({ success: true, ...data });
}

// ─── Thumbnail Upload to R2 ─────────────────────────────────────────────────
export async function uploadThumbnailToR2(r2Bucket, publicUrl, imageUrl, slug) {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scraper/1.0)' },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `thumbnails/${slug}.${ext}`;

    const buffer = await res.arrayBuffer();
    await r2Bucket.put(key, buffer, {
      httpMetadata: { contentType },
      customMetadata: { source: imageUrl },
    });

    return `${publicUrl}/${key}`;
  } catch (err) {
    console.error('R2 upload failed:', err.message);
    return null;
  }
}

// ─── Link Extractors ────────────────────────────────────────────────────────
export function extractVideoLinks(html) {
  const links = [];

  // Blogger native video player token
  const bloggerPattern = /play\.blogspot\.com\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*/g;
  for (const match of html.matchAll(bloggerPattern)) {
    links.push({ url: `https://${match[0]}`, type: 'blogger' });
  }

  // Direct MP4 URLs (not thumbnails/images)
  const mp4Pattern = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/g;
  for (const match of html.matchAll(mp4Pattern)) {
    const url = match[0];
    // Skip thumbnail-like URLs
    if (!url.match(/thumb|poster|preview|thumbnail|\.jpg|\.png|\.webp/i)) {
      links.push({ url, type: 'mp4' });
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return links.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function extractThumbnail(html, baseUrl) {
  // og:image meta tag
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) return ogMatch[1];

  // First img tag with src
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/i);
  if (imgMatch) {
    const src = imgMatch[1];
    return src.startsWith('http') ? src : new URL(src, baseUrl).href;
  }

  return null;
}

export function extractTitle(html) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) return ogTitle[1].trim();

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) return titleTag[1].trim();

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return h1[1].trim();

  return 'Untitled';
}

// Extract all post links from a blog index/sitemap page
export function extractPostLinks(html, baseUrl) {
  const links = new Set();
  const domain = new URL(baseUrl).origin;

  // Blogger-style post links
  const patterns = [
    /<a[^>]+href=["']([^"']+\/\d{4}\/\d{2}\/[^"']+\.html)[^"']*["']/gi,
    /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*post[^"']*["']/gi,
    /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = match[1];
      try {
        const abs = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        if (abs.startsWith(domain)) links.add(abs);
      } catch (_) {}
    }
  }

  return [...links];
}

// ─── Human-readable file size ───────────────────────────────────────────────
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Date helpers ────────────────────────────────────────────────────────────
export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
