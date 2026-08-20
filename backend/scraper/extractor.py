"""
Scraper / extractor core.
Supports:
  - Blogger-style sites (fetches Atom feed, fully paginated)
  - WordPress sites (REST API paginated, RSS fallback)
  - Generic sitemap fallback
  - Extracts MP4 links and Blogger native video player tokens
  - Custom per-site video/poster pattern (stored in MongoDB site_settings)
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

# Generic embed/player URL — catches plain-text player links in post content
# e.g. https://vidmap.online/player/embed.php?id=572
RE_EMBED_PLAYER = re.compile(
    r"""https?://[^\s"'<>\[\]]*(?:/player/|/embed(?:\.php)?|/watch|/video/)(?:[^\s"'<>\[\]]*)[?&]\w+=[^\s"'<>\[\]]+""",
    re.IGNORECASE,
)


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

def _build_custom_pattern(example_url: str) -> re.Pattern | None:
    """
    Given an example URL like:
      https://zerostorage.net/api/files/download/a2e9b243-1e90-4e6c-a328-566ee4a3c2ed?track=true
    Build a regex that matches URLs with the same base path but any UUID/ID segment.
    Strategy:
      1. Parse the URL
      2. Replace any UUID-like or long hex/alphanumeric segments (8+ chars) with a wildcard group
      3. Escape everything else
    """
    if not example_url:
        return None
    try:
        parsed = urlparse(example_url)
        # Build pattern from scheme + host + path (ignore query for matching)
        base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        # Split path into parts and replace ID-like segments with wildcards
        parts = base.split("/")
        pattern_parts = []
        for part in parts:
            # UUID or long alphanumeric/hex segment → wildcard
            if re.fullmatch(r'[0-9a-fA-F\-]{8,}', part):
                pattern_parts.append(r'[0-9a-zA-Z\-_]{4,}')
            else:
                pattern_parts.append(re.escape(part))
        pattern_str = r"/".join(pattern_parts)
        # Allow optional query string at the end
        pattern_str += r'(?:\?[^\s"\'<>]*)?'
        return re.compile(pattern_str, re.IGNORECASE)
    except Exception as e:
        logger.warning(f"Could not build custom pattern from '{example_url}': {e}")
        return None


def extract_video_links_custom(html: str, pattern: re.Pattern) -> list[dict]:
    """Extract video links using a custom compiled pattern."""
    links = []
    seen = set()
    for m in pattern.finditer(html):
        url = m.group(0)
        if url not in seen:
            seen.add(url)
            # Determine type
            vtype = "mp4" if url.lower().endswith(".mp4") or ".mp4?" in url.lower() else "mp4"
            links.append({"video_link": url, "type": vtype})
    return links


def extract_video_links_default(html: str, base_url: str) -> list[dict]:
    """
    Default extraction:
      1. Direct .mp4 URLs
      2. Blogger native player links
      3. Generic embed/player URLs in plain text
      4. <iframe src> and <iframe data-src> (lazy-load pattern)
      5. Any URL inside <script> tags that looks like an embed/player/stream
      6. JS variable assignments: src = "...", file: "...", source: "..."
    """
    links = []
    seen = set()

    SKIP_DOMAINS = {"youtube.com", "youtu.be", "google.com", "googleapis.com",
                    "gstatic.com", "facebook.com", "twitter.com", "instagram.com",
                    "disqus.com", "gravatar.com", "wp.com", "wordpress.com"}

    def _is_skip(url: str) -> bool:
        try:
            host = urlparse(url).netloc.lower().lstrip("www.")
            return any(host == d or host.endswith("." + d) for d in SKIP_DOMAINS)
        except Exception:
            return False

    def _add(url: str, vtype: str):
        url = url.strip().rstrip("\"',;) ")
        if not url or url in seen or _is_skip(url):
            return
        seen.add(url)
        links.append({"video_link": url, "type": vtype})

    # 1. Direct .mp4 URLs
    for m in RE_MP4.finditer(html):
        _add(m.group(0), "mp4")

    # 2. Blogger native player
    for m in RE_BLOGGER.finditer(html):
        _add(m.group(0), "blogger")

    # 3. Generic embed/player plain-text links
    for m in RE_EMBED_PLAYER.finditer(html):
        _add(m.group(0), "embed")

    soup = BeautifulSoup(html, "lxml")

    # 4. All iframes — src AND data-src (lazy-load)
    for iframe in soup.find_all("iframe"):
        for attr in ("src", "data-src", "data-lazy-src"):
            src = iframe.get(attr, "").strip()
            if not src or src.startswith("about:") or src.startswith("javascript:"):
                continue
            if "blogger.com/video" in src:
                _add(src, "blogger")
            elif "youtube.com" not in src and "youtu.be" not in src:
                _add(src, "embed")

    # 5. Scan every <script> tag for embed/player/stream/mp4 URLs
    RE_JS_URL = re.compile(
        r"""(?:src|file|source|url|video|stream|embed|player)\s*[:=]\s*["']([^"']{10,})["']""",
        re.IGNORECASE,
    )
    for script in soup.find_all("script"):
        text = script.string or ""
        # 5a. JS key-value: src: "url", file: "url", etc.
        for m in RE_JS_URL.finditer(text):
            candidate = m.group(1).strip()
            if candidate.startswith("http"):
                if ".mp4" in candidate.lower():
                    _add(candidate, "mp4")
                elif any(x in candidate.lower() for x in ["/embed", "/player", "/stream", "/video/"]):
                    _add(candidate, "embed")
        # 5b. Any raw http URL in script containing known video path parts
        for m in re.finditer(r'https?://[^\s"\'\\<>]{10,}', text):
            u = m.group(0).rstrip("\"',;)\\")
            if any(x in u.lower() for x in [".mp4", "/embed", "/player/", "/stream", "/video/"]):
                if ".mp4" in u.lower():
                    _add(u, "mp4")
                else:
                    _add(u, "embed")

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


def extract_thumbnail_custom(html: str, pattern: re.Pattern) -> str | None:
    """Extract poster/thumbnail using a custom pattern."""
    m = pattern.search(html)
    return m.group(0) if m else None


def extract_title(soup: BeautifulSoup) -> str:
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return og["content"].strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    return soup.title.string.strip() if soup.title else "Untitled"


# ── Post scraper ───────────────────────────────────────────────────────────────

async def scrape_post(url: str, client: httpx.AsyncClient, site_cfg: dict | None = None) -> list[dict]:
    """
    Scrape a single post URL.
    site_cfg: result of mongo.get_site_settings() — controls custom mode.
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

    cfg = site_cfg or {}
    custom_mode = cfg.get("custom_mode", False)

    # ── Video links ──────────────────────────────────────────────────────────
    if custom_mode and cfg.get("video_pattern"):
        compiled = _build_custom_pattern(cfg["video_pattern"])
        video_links = extract_video_links_custom(html, compiled) if compiled else extract_video_links_default(html, url)
    else:
        video_links = extract_video_links_default(html, url)

    if not video_links:
        logger.info(f"No video links found: {url}")
        return []

    # ── Thumbnail ────────────────────────────────────────────────────────────
    if custom_mode and not cfg.get("poster_keep_default", True) and cfg.get("poster_pattern"):
        compiled_poster = _build_custom_pattern(cfg["poster_pattern"])
        thumb_url = extract_thumbnail_custom(html, compiled_poster) if compiled_poster else extract_thumbnail(soup, url)
    else:
        thumb_url = extract_thumbnail(soup, url)

    # Download and upload thumbnail once
    r2_thumb = None
    if thumb_url:
        img_data = await download_image(thumb_url, client)
        if img_data:
            try:
                r2_thumb = await upload_thumbnail(img_data)
            except Exception as e:
                logger.warning(f"R2 upload failed, falling back to original: {e}")
                r2_thumb = thumb_url

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


# ── Platform detection ─────────────────────────────────────────────────────────

def _detect_platform(site_url: str, html: str) -> str:
    if "blogspot.com" in site_url:
        return "blogger"
    if "wp-content" in html or "wp-json" in html or "wordpress" in html.lower():
        return "wordpress"
    if "feeds/posts/default" in html or "data:blogger" in html:
        return "blogger"
    return "unknown"


# ── Post discovery ─────────────────────────────────────────────────────────────

async def _get_blogger_posts(site_url: str, client: httpx.AsyncClient, last_post_url: str | None) -> list[str]:
    """Paginate fully through Blogger Atom feed."""
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
    WordPress REST API fully paginated → RSS fallback → sitemap fallback.
    Uses X-WP-TotalPages header to know exact page count.
    """
    post_urls = []
    base = site_url.rstrip("/")

    # ── REST API (paginated using total pages header) ──────────────────────
    page = 1
    per_page = 100
    total_pages = None

    while True:
        api_url = (
            f"{base}/wp-json/wp/v2/posts"
            f"?per_page={per_page}&page={page}&_fields=link&orderby=date&order=desc"
        )
        try:
            r = await client.get(api_url, timeout=20, follow_redirects=True)
            if r.status_code == 400:
                # page beyond range
                break
            if r.status_code != 200:
                break

            # Read total pages from header on first call
            if total_pages is None:
                total_pages = int(r.headers.get("X-WP-TotalPages", 1))
                logger.info(f"WordPress REST: {total_pages} total pages for {site_url}")

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

            if found_stop or page >= total_pages:
                break
            page += 1

        except Exception as e:
            logger.warning(f"WordPress REST API error page {page}: {e}")
            break

    if post_urls:
        logger.info(f"WordPress REST API: found {len(post_urls)} posts for {site_url}")
        return post_urls

    # ── RSS fallback ───────────────────────────────────────────────────────
    logger.info(f"WordPress REST failed, trying RSS for {site_url}")
    feed_url = f"{base}/feed/"
    rss_page = 1
    while True:
        try:
            paged_url = f"{feed_url}?paged={rss_page}" if rss_page > 1 else feed_url
            html = await fetch_html(paged_url, client)
            soup = BeautifulSoup(html, "lxml-xml")
            items = soup.find_all("item")
            if not items:
                break
            found_stop = False
            for item in items:
                link = item.find("link")
                if link:
                    url = (link.text or "").strip() or (link.next_sibling or "").strip()
                    if url == last_post_url:
                        found_stop = True
                        break
                    if url:
                        post_urls.append(url)
            if found_stop or len(items) < 10:
                break
            rss_page += 1
        except Exception as e:
            logger.warning(f"WordPress RSS page {rss_page} failed: {e}")
            break

    logger.info(f"WordPress RSS: found {len(post_urls)} posts for {site_url}")
    return post_urls


async def _get_sitemap_posts(site_url: str, client: httpx.AsyncClient, last_post_url: str | None) -> list[str]:
    """Generic sitemap fallback — works for any CMS."""
    post_urls = []
    base = site_url.rstrip("/")

    for sitemap_path in ["/sitemap.xml", "/sitemap_index.xml", "/post-sitemap.xml"]:
        sitemap_url = base + sitemap_path
        try:
            html = await fetch_html(sitemap_url, client)
            soup = BeautifulSoup(html, "lxml-xml")

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
    """Auto-detect platform and discover ALL post URLs (fully paginated)."""
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


# ── Site crawler ───────────────────────────────────────────────────────────────

async def crawl_site(
    site_url: str,
    last_post_url: str | None = None,
    job_id: str | None = None,
    pause_event: asyncio.Event | None = None,
    cancel_flags: dict | None = None,
):
    """
    Full site crawl. Publishes progress updates to MongoDB crawler_temp.
    Loads per-site settings from MongoDB site_settings.
    Supports pause (pause_event) and cancel (cancel_flags[job_id]).
    """
    # Load per-site custom settings
    site_cfg = await mongo.get_site_settings(site_url)
    logger.info(f"Site config for {site_url}: custom_mode={site_cfg.get('custom_mode')}")

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
    cancelled = False

    async with httpx.AsyncClient(timeout=30) as client:
        for i, post_url in enumerate(post_urls):
            # ── Check cancel ────────────────────────────────────────────
            if cancel_flags and job_id and cancel_flags.get(job_id):
                logger.info(f"Crawl cancelled: {site_url} after {i} posts")
                cancelled = True
                break

            # ── Wait if paused ──────────────────────────────────────────
            if pause_event:
                await pause_event.wait()

            # ── Check cancel again after unpausing ──────────────────────
            if cancel_flags and job_id and cancel_flags.get(job_id):
                cancelled = True
                break

            status_str = "running"
            await temp_col.update_one(
                {"job_id": job_id},
                {"$set": {
                    "current_url": post_url,
                    "progress": i + 1,
                    "total": total,
                    "scraped": scraped,
                    "errors": errors,
                    "status": status_str,
                }},
                upsert=True,
            )

            results = await scrape_post(post_url, client, site_cfg)
            if results:
                scraped += len(results)
            else:
                errors += 1

            if i < total - 1:
                await asyncio.sleep(settings.SCRAPE_DELAY)

    await d1.update_site_scan(site_url, first_post_url)
    await d1.upsert_site(site_url)

    final_status = "cancelled" if cancelled else "done"
    await temp_col.update_one(
        {"job_id": job_id},
        {"$set": {"status": final_status, "scraped": scraped, "errors": errors}},
        upsert=True,
    )
    await history_col.insert_one({
        "site_url": site_url,
        "scraped": scraped,
        "errors": errors,
        "total_posts": total,
        "finished_at": asyncio.get_event_loop().time(),
        "cancelled": cancelled,
    })
    logger.info(f"Crawl {final_status}: {site_url} — {scraped} saved, {errors} errors")
