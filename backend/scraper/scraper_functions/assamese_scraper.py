"""
backend/scraper/scraper_functions/assamese_scraper.py
======================================================
Domain-specific Playwright scraper for assamesesexvideos.com.

Kab use hota hai:
  extractor.py → scrape_post() → domain == "assamesesexvideos.com"
  → is module ka scrape_post_playwright() call hota hai

Pipeline:
  1. Post page Playwright se open karo + network intercept karo
  2. wait_secs tak rukho (video.js + zerostorage CDN requests load hon)
  3. zerostorage.net download URL milne par → done
  4. Agar sirf vidmap.online mila → vidmap page bhi Playwright se open karo
     aur zerostorage URL intercept karo

Returns:
  list[dict]  — project ke baaki code jaisa hi format:
    [{"video_link": str, "type": "zerostorage"}, ...]

Requires:
  pip install playwright
  playwright install chromium --with-deps

Note: Playwright Docker me kaam kare, isliye Dockerfile me chromium install
      karna hoga. Neeche DOCKER_NOTE dekho.

DOCKER_NOTE:
  # Dockerfile ke stage-1 (runtime) me yeh add karo:
  RUN apk add --no-cache chromium chromium-chromedriver nss freetype harfbuzz ca-certificates ttf-freefont
  ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
  ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
"""

import asyncio
import logging
import re

from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── Playwright import (graceful — agar install nahi hai to fallback) ──────────
try:
    from playwright.async_api import async_playwright, BrowserContext, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning(
        "playwright not installed — assamese_scraper will be unavailable. "
        "Run: pip install playwright && playwright install chromium --with-deps"
    )

# ── Config ─────────────────────────────────────────────────────────────────────
SITE_ORIGIN = "https://assamesesexvideos.com"
DEFAULT_WAIT_SECS = 6   # JS load wait (increase on slow connections)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Regex patterns ─────────────────────────────────────────────────────────────

RE_ZERO_DL = re.compile(
    r'https?://zerostorage\.net/api/files/download/'
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    r'\?track=true',
    re.IGNORECASE,
)
RE_ZERO_ANY = re.compile(
    r'https?://zerostorage\.net/[^\s"\'<>\\]+',
    re.IGNORECASE,
)
RE_VIDMAP = re.compile(
    r'https?://vidmap\.online/[^\s"\'<>\\]+',
    re.IGNORECASE,
)
RE_MP4 = re.compile(
    r'https?://[^\s"\'<>\\]+\.mp4(?:\?[^\s"\'<>\\]*)?',
    re.IGNORECASE,
)

# Priority order — lower index = better
_PRIORITY = [
    "network_zero_dl",   # zerostorage download URL — network intercept se
    "network_zero",      # koi bhi zerostorage URL — network intercept se
    "html_zero_dl",      # zerostorage download URL — rendered HTML me
    "html_zero",         # koi bhi zerostorage URL — rendered HTML me
    "video_src",         # <video src>
    "video_currentsrc",  # <video>.currentSrc (JS set karta hai)
    "source_src",        # <source src> video ke andar
    "iframe_zero",       # iframe jo zerostorage point kare
    "mp4",               # direct .mp4 link
    "iframe_other",      # koi aur iframe
]

def _rank(item: dict) -> int:
    try:
        return _PRIORITY.index(item["type"])
    except ValueError:
        return 99


# ── Network capture ────────────────────────────────────────────────────────────

def _make_capture(captured: list[str], domains: list[str]):
    """
    Returns (request_handler, response_handler).
    Dono handlers matching domain URLs ko captured list me append karte hain.
    """
    async def on_request(request):
        url = request.url
        if any(d in url for d in domains) and url not in captured:
            captured.append(url)
            logger.debug(f"[net:req] {url[:120]}")

    async def on_response(response):
        url = response.url
        if any(d in url for d in domains) and url not in captured:
            captured.append(url)
            logger.debug(f"[net:res] {url[:120]}")

    return on_request, on_response


def _classify_network(captured: list[str]) -> list[dict]:
    """Network-intercepted URLs ko typed dicts me convert karo."""
    items: list[dict] = []
    seen: set[str] = set()
    for url in captured:
        if url in seen:
            continue
        seen.add(url)
        if RE_ZERO_DL.search(url):
            items.append({"type": "network_zero_dl", "url": url})
        elif "zerostorage.net" in url:
            items.append({"type": "network_zero", "url": url})
        # vidmap.online sirf ek intermediate player hai — skip
    return items


def _scan_html(html: str) -> list[dict]:
    """Rendered HTML me zerostorage + mp4 URLs scan karo."""
    items: list[dict] = []
    seen: set[str] = set()

    def _add(t: str, u: str):
        u = u.strip().rstrip("\"',;) \\")
        if u and u not in seen:
            seen.add(u)
            items.append({"type": t, "url": u})

    for m in RE_ZERO_DL.finditer(html):
        _add("html_zero_dl", m.group(0))
    for m in RE_ZERO_ANY.finditer(html):
        _add("html_zero", m.group(0))
    for m in RE_MP4.finditer(html):
        _add("mp4", m.group(0))
    return items


async def _dom_urls(page: "Page") -> list[dict]:
    """DOM se video/source/iframe elements ke URLs nikalo (JS evaluate)."""
    try:
        return await page.evaluate("""
            () => {
                const items = [];
                const seen  = new Set();
                const add   = (type, url) => {
                    if (url && typeof url === 'string' && url.startsWith('http') && !seen.has(url)) {
                        seen.add(url);
                        items.push({ type, url });
                    }
                };
                document.querySelectorAll('video').forEach(v => {
                    add('video_src',        v.src        || '');
                    add('video_currentsrc', v.currentSrc || '');
                    v.querySelectorAll('source').forEach(s => add('source_src', s.src || ''));
                });
                document.querySelectorAll('source').forEach(s => add('source_src', s.src || ''));
                document.querySelectorAll('iframe').forEach(f => {
                    const src = f.src || '';
                    if (!src) return;
                    const skipDomains = ['youtube', 'google', 'facebook', 'twitter', 'disqus'];
                    if (skipDomains.some(d => src.includes(d))) return;
                    const t = src.includes('zerostorage') ? 'iframe_zero' : 'iframe_other';
                    add(t, src);
                });
                return items;
            }
        """)
    except Exception as e:
        logger.warning(f"DOM evaluate failed: {e}")
        return []


def _best_url(all_items: list[dict]) -> dict | None:
    """Sabse best URL item return karo (priority ke hisaab se)."""
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in all_items:
        u = item.get("url", "")
        if u and u not in seen:
            seen.add(u)
            deduped.append(item)
    if not deduped:
        return None
    return sorted(deduped, key=_rank)[0]


# ── Single post scraper ────────────────────────────────────────────────────────

async def _scrape_one_post(
    context: "BrowserContext",
    post_url: str,
    wait_secs: int,
) -> list[dict]:
    """
    Ek post URL se zerostorage video link nikalo.
    Returns list[dict] — {"video_link": ..., "type": "zerostorage"/"mp4"}
    """
    page = await context.new_page()
    captured: list[str] = []
    on_req, on_res = _make_capture(captured, ["zerostorage.net", "vidmap.online"])
    page.on("request",  on_req)
    page.on("response", on_res)

    try:
        logger.info(f"  [playwright] Loading: {post_url}")
        await page.goto(post_url, wait_until="domcontentloaded", timeout=30_000)

        logger.info(f"  [playwright] Waiting {wait_secs}s for JS/video.js...")
        await asyncio.sleep(wait_secs)

        # Collect from post page
        all_items  = _classify_network(captured)
        all_items += _scan_html(await page.content())
        all_items += await _dom_urls(page)

        best = _best_url(all_items)

        # ── vidmap fallback: agar zerostorage nahi mila to vidmap page kholo ─
        vidmap_urls = [u for u in captured if "vidmap.online" in u]
        if (not best or "zero" not in best["type"]) and vidmap_urls:
            vidmap_url = vidmap_urls[0]
            logger.info(f"  [playwright] vidmap found → opening: {vidmap_url[:100]}")

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
                    referer=SITE_ORIGIN,
                )
                logger.info(f"  [playwright] vidmap loaded. Waiting {wait_secs}s...")
                await asyncio.sleep(wait_secs)

                v_items  = _classify_network(vcaptured)
                v_items += _scan_html(await vpage.content())
                v_items += await _dom_urls(vpage)

                # vidmap results ko pehle rakho (zyada specific hain)
                all_items = v_items + all_items
                best = _best_url(all_items)

            except Exception as e:
                logger.warning(f"  [playwright] vidmap page error: {e}")
            finally:
                await vpage.close()

        # ── Result build karo ─────────────────────────────────────────────────
        if best:
            vtype = "zerostorage" if "zero" in best["type"] else best["type"]
            logger.info(f"  [playwright] ✓ found [{vtype}]: {best['url'][:100]}")
            return [{"video_link": best["url"], "type": vtype}]

        logger.info(f"  [playwright] ✗ no video URL found for: {post_url}")
        return []

    except Exception as e:
        logger.error(f"  [playwright] Error on {post_url}: {e}")
        return []
    finally:
        await page.close()


# ── Playwright browser context manager ────────────────────────────────────────

_browser_lock = asyncio.Lock()
_shared_context: "BrowserContext | None" = None
_playwright_instance = None


async def _get_context() -> "BrowserContext":
    """
    Shared Playwright browser context — ek hi browser process use karo.
    Thread-safe lazy initialization.
    """
    global _shared_context, _playwright_instance

    async with _browser_lock:
        if _shared_context is None:
            logger.info("[playwright] Launching Chromium browser...")
            _playwright_instance = await async_playwright().start()
            browser = await _playwright_instance.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            _shared_context = await browser.new_context(
                user_agent=UA,
                locale="en-US",
                viewport={"width": 1280, "height": 800},
            )
            # Images/fonts block karo — speed ke liye (JS rehne do)
            await _shared_context.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}",
                lambda route: route.abort(),
            )
            logger.info("[playwright] Browser ready.")

    return _shared_context


async def close_browser():
    """App shutdown par call karo — resources free karta hai."""
    global _shared_context, _playwright_instance
    async with _browser_lock:
        if _shared_context:
            try:
                await _shared_context.close()
            except Exception:
                pass
            _shared_context = None
        if _playwright_instance:
            try:
                await _playwright_instance.stop()
            except Exception:
                pass
            _playwright_instance = None
    logger.info("[playwright] Browser closed.")


# ── Public API — extractor.py yahi call karta hai ─────────────────────────────

async def scrape_post_playwright(
    post_url: str,
    wait_secs: int = DEFAULT_WAIT_SECS,
) -> list[dict]:
    """
    extractor.py se call hota hai jab domain == assamesesexvideos.com.

    Args:
        post_url:   Post ka full URL
        wait_secs:  JS load wait time (default 6s)

    Returns:
        list[dict] — [{"video_link": str, "type": str}]
        Empty list agar kuch nahi mila.
    """
    if not PLAYWRIGHT_AVAILABLE:
        logger.error(
            "[playwright] playwright not installed. "
            "Run: pip install playwright && playwright install chromium --with-deps"
        )
        return []

    try:
        context = await _get_context()
        return await _scrape_one_post(context, post_url, wait_secs)
    except Exception as e:
        logger.error(f"[playwright] scrape_post_playwright failed: {e}")
        return []
