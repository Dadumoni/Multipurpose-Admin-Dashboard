"""
scraper_functions/assamesesexvideos.py
======================================
Domain-specific scraper for https://assamesesexvideos.com

Why Playwright (not httpx):
  Videos are loaded by video.js from vidmap.online — the zerostorage.net
  download URL is only visible AFTER JS executes (~5-6s). Playwright renders
  the page in a real Chromium instance and intercepts the network request.

Pipeline per post:
  1. Open post page in Playwright, wait wait_secs for video.js
  2. Intercept zerostorage.net network requests  ← primary method
  3. If not found: open vidmap.online tab, wait again
  4. Fallback: scan rendered HTML / DOM for zerostorage URLs
  5. Download og:image poster → upload to R2
  6. Save (slug, title, poster, video_link) to D1

Called from extractor.crawl_site() when domain == assamesesexvideos.com
"""

import asyncio
import logging
import re

import httpx
from playwright.async_api import async_playwright, BrowserContext, Page

from backend.database import d1
from backend.storage.r2 import upload_thumbnail
from backend.utils.slug import generate_slug

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

SITE_URL = "https://assamesesexvideos.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# JS load wait — video.js needs ~5-6s to fire the zerostorage request
DEFAULT_WAIT = 6

# ── Regex ─────────────────────────────────────────────────────────────────────

RE_ZEROSTORAGE_DL = re.compile(
    r'https?://zerostorage\.net/api/files/download/'
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    r'\?track=true',
    re.IGNORECASE,
)
RE_ZEROSTORAGE_ANY = re.compile(
    r'https?://zerostorage\.net/[^\s"\'<>\\]+',
    re.IGNORECASE,
)
RE_MP4 = re.compile(
    r'https?://[^\s"\'<>\\]+\.mp4(?:\?[^\s"\'<>\\]*)?',
    re.IGNORECASE,
)

# Priority: network intercept > rendered HTML > DOM elements
URL_PRIORITY = [
    "network_zero_dl",
    "network_zero",
    "html_zero_dl",
    "html_zero",
    "video_src",
    "video_currentsrc",
    "source_src",
    "iframe_zero",
    "mp4",
    "iframe_other",
]


def _rank(item: dict) -> int:
    try:
        return URL_PRIORITY.index(item["type"])
    except ValueError:
        return 99


# ── Network capture ───────────────────────────────────────────────────────────

def _make_capture(captured: list[str], domains: list[str]):
    async def on_request(request):
        url = request.url
        if any(d in url for d in domains) and url not in captured:
            captured.append(url)
            logger.debug(f"  [net-req] {url[:100]}")

    async def on_response(response):
        url = response.url
        if any(d in url for d in domains) and url not in captured:
            captured.append(url)
            logger.debug(f"  [net-res] {url[:100]}")

    return on_request, on_response


def _classify_captured(captured: list[str]) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for url in captured:
        if url in seen:
            continue
        seen.add(url)
        if RE_ZEROSTORAGE_DL.search(url):
            items.append({"type": "network_zero_dl", "url": url})
        elif "zerostorage.net" in url:
            items.append({"type": "network_zero", "url": url})
    return items


def _scan_html(html: str) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()

    def _add(t: str, u: str):
        u = u.strip().rstrip("\"',;) \\")
        if u and u not in seen:
            seen.add(u)
            items.append({"type": t, "url": u})

    for m in RE_ZEROSTORAGE_DL.finditer(html):
        _add("html_zero_dl", m.group(0))
    for m in RE_ZEROSTORAGE_ANY.finditer(html):
        _add("html_zero", m.group(0))
    for m in RE_MP4.finditer(html):
        _add("mp4", m.group(0))
    return items


async def _dom_urls(page: Page) -> list[dict]:
    return await page.evaluate("""
        () => {
            const items = [];
            const seen  = new Set();
            const add   = (type, url) => {
                if (url && url.startsWith('http') && !seen.has(url)) {
                    seen.add(url);
                    items.push({ type, url });
                }
            };
            document.querySelectorAll('video').forEach(v => {
                add('video_src',        v.src);
                add('video_currentsrc', v.currentSrc);
                v.querySelectorAll('source').forEach(s => add('source_src', s.src));
            });
            document.querySelectorAll('source').forEach(s => add('source_src', s.src));
            document.querySelectorAll('iframe').forEach(f => {
                if (!f.src) return;
                const skip = ['youtube', 'google', 'facebook', 'twitter', 'disqus'];
                if (skip.some(d => f.src.includes(d))) return;
                add(f.src.includes('zerostorage') ? 'iframe_zero' : 'iframe_other', f.src);
            });
            return items;
        }
    """)


def _best(all_items: list[dict]) -> dict | None:
    seen: set[str] = set()
    deduped = []
    for item in all_items:
        u = item.get("url", "")
        if u and u not in seen:
            seen.add(u)
            deduped.append(item)
    return sorted(deduped, key=_rank)[0] if deduped else None


# ── Single post: Playwright extraction ───────────────────────────────────────

async def _extract_video_url(
    context: BrowserContext,
    post_url: str,
    wait_secs: int,
) -> tuple[str | None, str | None, str | None]:
    """
    Returns (video_url, video_type, poster_url) for one post.
    poster_url comes from og:image on the post page.
    """
    page = await context.new_page()
    captured: list[str] = []
    on_req, on_res = _make_capture(captured, ["zerostorage.net", "vidmap.online"])
    page.on("request",  on_req)
    page.on("response", on_res)

    video_url  = None
    video_type = None
    poster_url = None

    try:
        await page.goto(post_url, wait_until="domcontentloaded", timeout=30_000)

        # Grab poster from og:image
        try:
            poster_url = await page.get_attribute(
                'meta[property="og:image"]', "content", timeout=2000
            )
        except Exception:
            pass

        logger.info(f"  [{post_url[-50:]}] waiting {wait_secs}s for video.js…")
        await asyncio.sleep(wait_secs)

        # Collect from post page
        all_items  = _classify_captured(captured)
        all_items += _scan_html(await page.content())
        all_items += await _dom_urls(page)
        best = _best(all_items)

        # If no zerostorage yet but vidmap was intercepted → open vidmap tab
        vidmap_urls = [u for u in captured if "vidmap.online" in u]
        if (not best or "zero" not in best["type"]) and vidmap_urls:
            vidmap_url = vidmap_urls[0]
            logger.info(f"  Opening vidmap: {vidmap_url[:80]}")

            vpage = await context.new_page()
            vcaptured: list[str] = []
            von_req, von_res = _make_capture(vcaptured, ["zerostorage.net"])
            vpage.on("request",  von_req)
            vpage.on("response", von_res)

            try:
                await vpage.goto(
                    vidmap_url,
                    wait_until="domcontentloaded",
                    timeout=30_000,
                    referer=SITE_URL,
                )
                logger.info(f"  vidmap loaded, waiting {wait_secs}s…")
                await asyncio.sleep(wait_secs)

                v_items  = _classify_captured(vcaptured)
                v_items += _scan_html(await vpage.content())
                v_items += await _dom_urls(vpage)

                # vidmap results take priority
                all_items = v_items + all_items
                best = _best(all_items)
            except Exception as e:
                logger.warning(f"  vidmap page error: {e}")
            finally:
                await vpage.close()

        if best:
            video_url  = best["url"]
            video_type = best["type"]

    except Exception as e:
        logger.warning(f"  Playwright error [{post_url}]: {e}")
    finally:
        await page.close()

    return video_url, video_type, poster_url


# ── Poster: download + R2 upload ──────────────────────────────────────────────

async def _upload_poster(poster_url: str, client: httpx.AsyncClient) -> str | None:
    """Download og:image and upload to R2. Returns R2 public URL or None."""
    if not poster_url:
        return None
    try:
        r = await client.get(poster_url, follow_redirects=True, timeout=20)
        r.raise_for_status()
        content_type = r.headers.get("content-type", "image/jpeg").split(";")[0]
        r2_url = await upload_thumbnail(r.content, content_type=content_type)
        logger.info(f"  Poster uploaded: {r2_url}")
        return r2_url
    except Exception as e:
        logger.warning(f"  Poster upload failed ({poster_url}): {e}")
        return poster_url   # fallback: use original URL


# ── D1 save ───────────────────────────────────────────────────────────────────

async def _save_to_d1(title: str, video_url: str, r2_poster: str | None) -> int | None:
    """Generate slug and insert into D1 videos table. Returns new row id."""
    slug = generate_slug(title)
    try:
        row_id = await d1.insert_video(
            title      = title or "Untitled",
            slug       = slug,
            thumbnail  = r2_poster or "",
            video_link = video_url,
            vtype      = "zerostorage",
        )
        logger.info(f"  D1 saved: id={row_id} slug={slug}")
        return row_id
    except Exception as e:
        logger.error(f"  D1 insert failed: {e}")
        return None


# ── Public entry point (called from extractor.crawl_site) ────────────────────

async def scrape_post_assamesesexvideos(
    post_url: str,
    title: str,
    wait_secs: int = DEFAULT_WAIT,
    playwright_context: BrowserContext | None = None,
) -> list[dict]:
    """
    Scrape one post from assamesesexvideos.com.

    Args:
        post_url:            Full post URL
        title:               Post title (already extracted by crawl_site)
        wait_secs:           Seconds to wait for JS video player to fire
        playwright_context:  Reuse an existing Playwright context (for batch runs).
                             If None, a temporary context is created (slower).

    Returns:
        List of saved record dicts (empty list on failure) — same contract
        as extractor.scrape_post() so crawl_site can treat them identically.
    """
    own_playwright = playwright_context is None

    async def _run(context: BrowserContext) -> list[dict]:
        # 1. Extract video URL via Playwright
        video_url, video_type, poster_url = await _extract_video_url(
            context, post_url, wait_secs
        )

        if not video_url:
            logger.info(f"  No video URL found: {post_url}")
            return []

        # 2. Download poster → R2
        async with httpx.AsyncClient(
            headers={"User-Agent": UA}, timeout=20
        ) as client:
            r2_poster = await _upload_poster(poster_url, client)

        # 3. Save to D1
        row_id = await _save_to_d1(title, video_url, r2_poster)
        if not row_id:
            return []

        return [{
            "id":         row_id,
            "post_url":   post_url,
            "title":      title,
            "slug":       generate_slug(title),   # same format, for caller reference
            "video_link": video_url,
            "video_type": video_type,
            "thumbnail":  r2_poster or "",
        }]

    if own_playwright:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox",
                      "--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=UA,
                locale="en-US",
                viewport={"width": 1280, "height": 800},
            )
            await context.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}",
                lambda route: route.abort()
            )
            try:
                return await _run(context)
            finally:
                await browser.close()
    else:
        return await _run(playwright_context)
