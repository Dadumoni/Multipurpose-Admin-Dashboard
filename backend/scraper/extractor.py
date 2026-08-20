"""
Scraper / extractor core.
Supports:
  - Blogger-style sites (fetches sitemap or paginated index)
  - Extracts MP4 links and Blogger native video player tokens
  - Downloads poster/thumbnail and uploads to R2
  - Inserts records into D1
"""
import asyncio
import httpx
import logging
import re
import uuid
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

from backend.database import d1, mongo
from backend.storage.r2 import upload_thumbnail
from backend.utils.slug import generate_slug
from config.settings import settings

logger = logging.getLogger(__name__)

# ── Regex patterns ─────────────────────────────────────────────────────────────

# Direct .mp4 URLs (not thumbnails)
RE_MP4 = re.compile(
    r'https?://[^\s"\'<>]+\.mp4(?:\?[^\s"\'<>]*)?',
    re.IGNORECASE,
)

# Blogger native video: videoplay?docid= or /video_redirect?docid=
RE_BLOGGER = re.compile(
    r'https?://(?:video\.googleusercontent\.com|www\.blogger\.com)/video(?:play|_redirect)\?[^\s"\'<>]*docid=[^\s"\'<>]+',
    re.IGNORECASE,
)

# Blogger video container — data-video-id / docid attributes
RE_BLOGGER_DOCID = re.compile(r'docid=(-?\d+)', re.IGNORECASE)


# ── HTTP helpers ───────────────────────────────────────────────────────────────

async def fetch_html(url: str, client: httpx.AsyncClient) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        )
    }
    r = await client.get(url, headers=headers, follow_redirects=True, timeout=20)
    r.raise_for_status()
    return r.text


async def download_image(url: str, client: httpx.AsyncClient) -> bytes | None:
    try:
        r = await client.get(url, follow_redirects=True, timeout=20)
        r.raise_for_status()
        return r.content
    except Exception as e:
        logger.warning(f"Image download failed ({url}): {e}")
        return None


# ── Link extraction ────────────────────────────────────────────────────────────

def extract_video_links(html: str, base_url: str) -> list[dict]:
    """
    Returns list of { video_link, type } dicts found in the page HTML.
    """
    links = []
    seen = set()

    # MP4 direct links
    for m in RE_MP4.finditer(html):
        url = m.group(0)
        if url not in seen:
            seen.add(url)
            links.append({"video_link": url, "type": "mp4"})

    # Blogger video player links
    for m in RE_BLOGGER.finditer(html):
        url = m.group(0)
        if url not in seen:
            seen.add(url)
            links.append({"video_link": url, "type": "blogger"})

    # Blogger <iframe> with video.blogger.com src
    soup = BeautifulSoup(html, "lxml")
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src", "")
        if "video.blogger.com" in src or "youtube.com" in src:
            continue  # skip YouTube
        if "blogger.com/video" in src and src not in seen:
            seen.add(src)
            links.append({"video_link": src, "type": "blogger"})

    return links


def extract_thumbnail(soup: BeautifulSoup, base_url: str) -> str | None:
    """Try og:image → first <img> → None."""
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        return urljoin(base_url, og["content"])
    img = soup.find("img", src=True)
    if img:
        src = img["src"]
        if not src.startswith("data:"):
            return urljoin(base_url, src)
    return None


def extract_title(soup: BeautifulSoup) -> str:
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return og["content"].strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    return soup.title.string.strip() if soup.title else "Untitled"


# ── Post scraper ───────────────────────────────────────────────────────────────

async def scrape_post(url: str, client: httpx.AsyncClient) -> list[dict]:
    """
    Scrape a single post URL.
    Returns list of saved record dicts.
    """
    logger.info(f"Scraping: {url}")
    try:
        html = await fetch_html(url, client)
    except Exception as e:
        logger.error(f"Fetch error ({url}): {e}")
        return []

    soup = BeautifulSoup(html, "lxml")
    title = extract_title(soup)
    thumb_url = extract_thumbnail(soup, url)
    video_links = extract_video_links(html, url)

    if not video_links:
        logger.info(f"No video links found: {url}")
        return []

    # Download and upload thumbnail once
    r2_thumb = None
    if thumb_url:
        img_data = await download_image(thumb_url, client)
        if img_data:
            try:
                r2_thumb = await upload_thumbnail(img_data)
            except Exception as e:
                logger.warning(f"R2 upload failed, falling back to original: {e}")
                r2_thumb = thumb_url  # fallback

    saved = []
    for link in video_links:
        slug = generate_slug(title)
        try:
            vid_id = await d1.insert_video(
                title=title,
                slug=slug,
                thumbnail=r2_thumb or thumb_url,
                video_link=link["video_link"],
                vtype=link["type"],
            )
            saved.append({
                "id": vid_id,
                "title": title,
                "slug": slug,
                "thumbnail": r2_thumb or thumb_url,
                "video_link": link["video_link"],
                "type": link["type"],
            })
            logger.info(f"Saved video id={vid_id} slug={slug}")
        except Exception as e:
            logger.error(f"D1 insert failed: {e}")

    return saved


# ── Site crawler ───────────────────────────────────────────────────────────────

def _detect_platform(site_url: str, html: str) -> str:
    """Heuristically detect Blogger vs WordPress."""
    if "blogspot.com" in site_url:
        return "blogger"
    if "wp-content" in html or "wp-json" in html or "wordpress" in html.lower():
        return "wordpress"
    if "feeds/posts/default" in html or "data:blogger" in html:
        return "blogger"
    return "unknown"


async def _get_blogger_posts(site_url: str, client: httpx.AsyncClient, last_post_url: str | None) -> list[str]:
    """Paginate through Blogger Atom feed (max 500 per page)."""
    post_urls = []
    base = site_url.rstrip("/")
    start_index = 1
    page_size = 150

    while True:
        feed_url = f"{base}/feeds/posts/default?max-results={page_size}&start-index={start_index}&orderby=published"
        try:
            html = await fetch_html(feed_url, client)
        except Exception as e:
            logger.warning(f"Blogger feed error at index {start_index}: {e}")
            break

        soup = BeautifulSoup(html, "lxml-xml")
        entries = soup.find_all("entry")
        if not entries:
            break

        found_stop = False
        for entry in entries:
            link_tag = entry.find("link", rel="alternate")
            if not link_tag:
                continue
            post_url = link_tag.get("href", "")
            if post_url == last_post_url:
                found_stop = True
                break
            if post_url:
                post_urls.append(post_url)

        if found_stop or len(entries) < page_size:
            break
        start_index += page_size

    logger.info(f"Blogger: found {len(post_urls)} posts for {site_url}")
    return post_urls


async def _get_wordpress_posts(site_url: str, client: httpx.AsyncClient, last_post_url: str | None) -> list[str]:
    """
    WordPress REST API → /wp-json/wp/v2/posts (paginated).
    Falls back to RSS feed if REST API is disabled.
    """
    post_urls = []
    base = site_url.rstrip("/")

    # Try WP REST API first
    page = 1
    per_page = 100
    while True:
        api_url = f"{base}/wp-json/wp/v2/posts?per_page={per_page}&page={page}&_fields=link,date&orderby=date&order=desc"
        try:
            r = await client.get(api_url, timeout=20, follow_redirects=True)
            if r.status_code != 200:
                break
            posts = r.json()
            if not posts:
                break

            found_stop = False
            for post in posts:
                url = post.get("link", "")
                if url == last_post_url:
                    found_stop = True
                    break
                if url:
                    post_urls.append(url)

            if found_stop or len(posts) < per_page:
                break
            page += 1
        except Exception:
            break

    if post_urls:
        logger.info(f"WordPress REST API: found {len(post_urls)} posts for {site_url}")
        return post_urls

    # Fallback: RSS feed
    feed_url = f"{base}/feed/"
    try:
        html = await fetch_html(feed_url, client)
        soup = BeautifulSoup(html, "lxml-xml")
        for item in soup.find_all("item"):
            link = item.find("link")
            if link:
                url = link.text.strip() or link.next_sibling
                if url and url != last_post_url:
                    post_urls.append(url.strip())
                elif url == last_post_url:
                    break
    except Exception as e:
        logger.warning(f"WordPress RSS fallback failed for {site_url}: {e}")

    logger.info(f"WordPress RSS: found {len(post_urls)} posts for {site_url}")
    return post_urls


async def _get_sitemap_posts(site_url: str, client: httpx.AsyncClient, last_post_url: str | None) -> list[str]:
    """Generic sitemap.xml fallback — works for any CMS."""
    post_urls = []
    base = site_url.rstrip("/")

    for sitemap_path in ["/sitemap.xml", "/sitemap_index.xml", "/post-sitemap.xml"]:
        sitemap_url = base + sitemap_path
        try:
            html = await fetch_html(sitemap_url, client)
            soup = BeautifulSoup(html, "lxml-xml")

            # Sitemap index — recurse into sub-sitemaps
            for sm in soup.find_all("sitemap"):
                loc = sm.find("loc")
                if loc:
                    try:
                        sub_html = await fetch_html(loc.text.strip(), client)
                        sub_soup = BeautifulSoup(sub_html, "lxml-xml")
                        for url_tag in sub_soup.find_all("url"):
                            loc2 = url_tag.find("loc")
                            if loc2:
                                u = loc2.text.strip()
                                if u == last_post_url:
                                    return post_urls
                                if u and not u.endswith(".xml"):
                                    post_urls.append(u)
                    except Exception:
                        continue

            # Regular sitemap
            for url_tag in soup.find_all("url"):
                loc = url_tag.find("loc")
                if loc:
                    u = loc.text.strip()
                    if u == last_post_url:
                        return post_urls
                    if u and not u.endswith(".xml") and u != site_url:
                        post_urls.append(u)

            if post_urls:
                logger.info(f"Sitemap: found {len(post_urls)} posts for {site_url}")
                return post_urls
        except Exception:
            continue

    return post_urls


async def get_post_urls(site_url: str, client: httpx.AsyncClient, last_post_url: str | None = None) -> list[str]:
    """
    Auto-detect platform and discover post URLs.
    Strategy order:
      Blogger  → Atom feed (paginated) → sitemap fallback
      WordPress → REST API → RSS feed → sitemap fallback
      Unknown   → sitemap → RSS feed
    """
    # Fetch homepage to detect platform
    try:
        homepage = await fetch_html(site_url, client)
        platform = _detect_platform(site_url, homepage)
    except Exception:
        platform = "unknown"

    logger.info(f"Detected platform: {platform} for {site_url}")

    if platform == "blogger":
        urls = await _get_blogger_posts(site_url, client, last_post_url)
        if not urls:
            urls = await _get_sitemap_posts(site_url, client, last_post_url)
        return urls

    if platform == "wordpress":
        urls = await _get_wordpress_posts(site_url, client, last_post_url)
        if not urls:
            urls = await _get_sitemap_posts(site_url, client, last_post_url)
        return urls

    # Unknown — try everything
    urls = await _get_sitemap_posts(site_url, client, last_post_url)
    if not urls:
        urls = await _get_blogger_posts(site_url, client, last_post_url)
    if not urls:
        urls = await _get_wordpress_posts(site_url, client, last_post_url)
    return urls


async def crawl_site(site_url: str, last_post_url: str | None = None, job_id: str | None = None):
    """
    Full site crawl. Publishes progress updates to MongoDB crawler_temp.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        post_urls = await get_post_urls(site_url, client, last_post_url)

    if not post_urls:
        logger.info(f"No new posts for {site_url}")
        await d1.update_site_scan(site_url)
        return

    temp_col = await mongo.col_temp()
    history_col = await mongo.col_history()

    total = len(post_urls)
    scraped = 0
    errors = 0
    first_post_url = post_urls[0] if post_urls else None

    async with httpx.AsyncClient(timeout=30) as client:
        for i, post_url in enumerate(post_urls):
            # Update progress in MongoDB
            await temp_col.update_one(
                {"job_id": job_id},
                {"$set": {
                    "current_url": post_url,
                    "progress": i + 1,
                    "total": total,
                    "scraped": scraped,
                    "errors": errors,
                    "status": "running",
                }},
                upsert=True,
            )

            results = await scrape_post(post_url, client)
            if results:
                scraped += len(results)
            else:
                errors += 1

            if i < total - 1:
                await asyncio.sleep(settings.SCRAPE_DELAY)

    # Finalise
    await d1.update_site_scan(site_url, first_post_url)
    await d1.upsert_site(site_url)

    await temp_col.update_one(
        {"job_id": job_id},
        {"$set": {"status": "done", "scraped": scraped, "errors": errors}},
        upsert=True,
    )
    await history_col.insert_one({
        "site_url": site_url,
        "scraped": scraped,
        "errors": errors,
        "total_posts": total,
        "finished_at": asyncio.get_event_loop().time(),
    })
    logger.info(f"Crawl done: {site_url} — {scraped} saved, {errors} errors")
