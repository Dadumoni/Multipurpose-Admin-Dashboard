"""
=============================================================================
P4455 Standalone Scraper (VPS Edition)
=============================================================================
Features:
  1. Full & Live Crawling of p4455.com
  2. Frame extraction & 16:9 blurred grid thumbnail generation
  3. Direct Cloudflare R2 thumbnail upload
  4. Dual Sync:
     - MongoDB `posts` collection (complete metadata)
     - Supabase `viralhub_db` table (O(1) dashboard feed)
     - MongoDB `dashboard_stats` collection (atomic counter increments)
     - MongoDB `scraper_sites` collection (telemetry & status sync)
  5. Intelligent duplicate prevention & column matching
  6. Memory optimized for low CPU & RAM usage on VPS

Usage:
  python p4455_standalone.py           # Full scan on first run, then live monitoring
  python p4455_standalone.py --once    # Single incremental run (e.g., for crontab)
=============================================================================
"""

import sys
import os
import re
import time
import unicodedata
import urllib.parse
from io import BytesIO
from datetime import datetime
import gc

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from PIL import Image, ImageFilter
import numpy as np
import boto3
from botocore.exceptions import BotoCoreError
from pymongo import MongoClient

# Supabase Client Import (Optional fallback if not installed)
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

# ---------------------------------------------------------------------------
# 1. Environment & Configuration Setup
# ---------------------------------------------------------------------------
load_dotenv()

BASE_DOMAIN = os.getenv("BASE_DOMAIN", "https://p4455.com").rstrip("/")
START_PAGE_URL = f"{BASE_DOMAIN}/latest"
CURRENT_DOMAIN = "p4455.com"
SITE_ID = "p4455"
SITE_NAME = "p4455.com"

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "videos_db")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "posts")
META_COLLECTION = os.getenv("META_COLLECTION", "scraper_sites")

# Supabase Configuration (Sync to viralhub_db)
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY", "")
)
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "viralhub_db")

# Cloudflare R2 Configuration
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "")
R2_PUBLIC_CUSTOM_DOMAIN = (
    os.getenv("R2_PUBLIC_CUSTOM_DOMAIN") or os.getenv("R2_PUBLIC_URL", "")
).rstrip("/")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

# ---------------------------------------------------------------------------
# 2. Database & R2 Clients Initialization
# ---------------------------------------------------------------------------
print(f"[{SITE_ID}] Connecting to MongoDB ({MONGO_DB_NAME})...")
mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB_NAME]
mongo_col = mongo_db[MONGO_COLLECTION]
sites_col = mongo_db[META_COLLECTION]
dashboard_stats_col = mongo_db["dashboard_stats"]

# Supabase Client
supabase_client: Client | None = None
if HAS_SUPABASE and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"[{SITE_ID}] Connected to Supabase: {SUPABASE_URL} (Table: '{SUPABASE_TABLE}')")
    except Exception as e:
        print(f"[{SITE_ID}] Failed to initialize Supabase client: {e}")
else:
    if not HAS_SUPABASE:
        print(f"[{SITE_ID}] Notice: 'supabase' package not installed (run: pip install supabase)")
    else:
        print(f"[{SITE_ID}] Notice: SUPABASE_URL or SUPABASE_KEY not set in .env. Supabase sync will be skipped.")

# Cloudflare R2 Client (S3 API)
r2_s3_client = None
if R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME:
    try:
        r2_s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        print(f"[{SITE_ID}] Cloudflare R2 configured (Bucket: {R2_BUCKET_NAME})")
    except Exception as e:
        print(f"[{SITE_ID}] R2 S3 Client Error: {e}")
else:
    print(f"[{SITE_ID}] Notice: Cloudflare R2 credentials not fully provided.")

# ---------------------------------------------------------------------------
# 3. Helpers: Slug & Dashboard Stats Management
# ---------------------------------------------------------------------------


def generate_slug(title: str, video_id: str = "") -> str:
    """Generates a clean URL slug matching the dashboard system standard."""
    if not title:
        title = "video"
    norm = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("utf-8")
    clean = re.sub(r"[^\w\s-]", "", norm.lower())
    slug = re.sub(r"[-\s]+", "-", clean).strip("-")
    if not slug:
        slug = "video"

    if video_id:
        clean_vid = re.sub(r"[^\w-]", "", str(video_id).lower()).strip()
        if clean_vid:
            if slug.endswith(f"-{clean_vid}"):
                return slug[:100]
            return f"{slug[:80]}-{clean_vid}"
    return slug[:100]


def clean_title(raw_title: str) -> str:
    """Removes domain branding from video titles."""
    if not raw_title:
        return "Untitled"
    cleaned = re.sub(r"[\s\-\–|]*(?:mydesi\.net|p4455\.com|p4455).*$", "", raw_title, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    return cleaned if cleaned else raw_title.strip()


def update_dashboard_stats_atomic(new_posts: int = 1):
    """
    Atomically updates MongoDB `dashboard_stats` collection (global_stats)
    without running full collection scans.
    """
    if new_posts <= 0:
        return
    try:
        clean_site_key = SITE_ID.replace(".", "_")
        inc_dict = {
            "total_post_scraped": new_posts,
            "total_posts": new_posts,
            "total_videos": new_posts,
            f"sites_scraped.{clean_site_key}": new_posts,
        }
        dashboard_stats_col.update_one(
            {"id": "global_stats"},
            {"$inc": inc_dict, "$set": {"updated_at": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        # In case of dot path conflict from legacy schemas, auto-repair and retry
        if "conflict" in str(e).lower() or getattr(e, "code", None) == 40:
            try:
                dashboard_stats_col.update_one({"id": "global_stats"}, {"$unset": {"sites_scraped": 1}})
                dashboard_stats_col.update_one({"id": "global_stats"}, {"$set": {"sites_scraped": {}}})
                dashboard_stats_col.update_one({"id": "global_stats"}, {"$inc": inc_dict})
            except Exception:
                pass
        else:
            print(f"  [!] dashboard_stats update notice: {e}")


def save_scraped_post(post_data: dict) -> bool:
    """
    Saves/upserts video metadata simultaneously into:
      1. MongoDB `posts` collection
      2. Supabase `viralhub_db` table
      3. MongoDB `dashboard_stats` atomic counters
    Returns True if a new post was created or existing post was updated with missing data.
    """
    post_url = post_data.get("post_url")
    if not post_url:
        return False

    existing = mongo_col.find_one({"post_url": post_url})
    needs_update = False

    if existing:
        # Check every field to see if existing saved data is missing or incomplete
        new_title = post_data.get("title")
        if new_title and new_title != "Untitled" and existing.get("title") != new_title:
            needs_update = True

        new_duration = post_data.get("duration")
        if new_duration and new_duration != "Unknown" and existing.get("duration") != new_duration:
            needs_update = True

        new_720 = post_data.get("720p_link")
        existing_720 = existing.get("720p_link")
        if new_720 and (not existing_720 or "preview.mp4" in str(existing_720) or existing_720 != new_720):
            needs_update = True

        new_480 = post_data.get("480p_link")
        existing_480 = existing.get("480p_link")
        if new_480 and (not existing_480 or "preview.mp4" in str(existing_480) or existing_480 != new_480):
            needs_update = True

        existing_thumb = existing.get("thumbnail_url")
        new_thumb = post_data.get("thumbnail_url")
        if not existing_thumb or "preview.mp4" in str(existing_thumb) or (new_thumb and new_thumb != existing_thumb):
            needs_update = True

        if not needs_update:
            return False

    video_id = post_data.get("video_id") or (existing.get("video_id") if existing else str(int(time.time())))
    title = post_data.get("title") or (existing.get("title") if existing else "Untitled")
    slug = existing.get("slug") if (existing and existing.get("slug")) else generate_slug(title, video_id)
    post_data["slug"] = slug

    if not post_data.get("scraped_at"):
        post_data["scraped_at"] = time.time()

    # 1. Save / Upsert in MongoDB posts
    try:
        res = mongo_col.update_one({"post_url": post_url}, {"$set": post_data}, upsert=True)
        is_new = bool(res.upserted_id or not existing)
        mongo_id = str(res.upserted_id) if res.upserted_id else (str(existing["_id"]) if existing else str(video_id))
    except Exception as e:
        print(f"  [!] MongoDB Save Error for {post_url}: {e}")
        return False

    # 2. Update dashboard_stats if new post
    if is_new:
        update_dashboard_stats_atomic(1)

    # 3. Dual Sync to Supabase `viralhub_db`
    if supabase_client:
        try:
            thumb_url = post_data.get("thumbnail_url") or ""
            thumb_path = thumb_url
            if f"{video_id}_thumb.jpg" in thumb_url:
                thumb_path = f"/thumbnails/{video_id}_thumb.jpg"

            sb_payload = {
                "id": str(mongo_id),
                "title": title,
                "slug": slug,
                "720p_link": post_data.get("720p_link"),
                "480p_link": post_data.get("480p_link"),
                "thumbnail_url": thumb_path if thumb_path else None,
                "views": int(existing.get("views", 0)) if existing else 0,
                "scraped_at": float(post_data.get("scraped_at", time.time())),
            }

            supabase_client.table(SUPABASE_TABLE).upsert(sb_payload).execute()
            print(f"  [+] Supabase Synced: {title[:40]} ({slug})")
        except Exception as sb_err:
            print(f"  [!] Supabase Dual Sync Error: {sb_err}")

    return True


# ---------------------------------------------------------------------------
# 4. Image Processing & R2 Upload
# ---------------------------------------------------------------------------


def upload_thumbnail_to_r2(image_bytes: bytes, r2_path: str) -> str | None:
    """Uploads image bytes to Cloudflare R2 bucket and returns the public CDN URL."""
    if not r2_s3_client or not R2_BUCKET_NAME:
        return None
    try:
        r2_s3_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=r2_path,
            Body=image_bytes,
            ContentType="image/jpeg",
        )
        if R2_PUBLIC_CUSTOM_DOMAIN:
            return f"{R2_PUBLIC_CUSTOM_DOMAIN}/{r2_path}"
        return f"https://{R2_BUCKET_NAME}.r2.cloudflarestorage.com/{r2_path}"
    except BotoCoreError as e:
        print(f"  [!] Cloudflare R2 Upload Error: {e}")
        return None


def is_9by16(img, tol=0.02):
    return abs((img.width / img.height) - (9 / 16)) < tol


def trim_black_bars(img, threshold=24, min_ratio=0.03):
    gray = np.array(img.convert("L"))
    mask = gray > threshold

    rows = np.where(mask.mean(axis=1) > min_ratio)[0]
    cols = np.where(mask.mean(axis=0) > min_ratio)[0]

    if len(rows) == 0 or len(cols) == 0:
        return img

    top, bottom = rows[0], rows[-1] + 1
    left, right = cols[0], cols[-1] + 1

    if (right - left) < img.width * 0.1 or (bottom - top) < img.height * 0.1:
        return img

    return img.crop((left, top, right, bottom))


def cover_resize(img, cell_w, cell_h):
    img_ratio = img.width / img.height
    target_ratio = cell_w / cell_h
    if img_ratio > target_ratio:
        new_h = cell_h
        new_w = int(cell_h * img_ratio)
    else:
        new_w = cell_w
        new_h = int(cell_w / img_ratio)
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - cell_w) // 2
    top = (new_h - cell_h) // 2
    return resized.crop((left, top, left + cell_w, top + cell_h))


def fit_width_blur_tb(img, cell_w, cell_h, blur_radius=25):
    new_w = cell_w
    new_h = int(round(cell_w * img.height / img.width))

    if new_h >= cell_h:
        return cover_resize(img, cell_w, cell_h)

    bg = cover_resize(img, cell_w, cell_h).filter(ImageFilter.GaussianBlur(blur_radius))
    fg = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    bg.paste(fg, (0, (cell_h - new_h) // 2))
    return bg


def is_16by9(img, tol=0.05):
    if abs((img.width / img.height) - (16 / 9)) >= tol:
        return False
    gray = np.array(img.convert("L").resize((320, 180)), dtype=np.float32)
    detail = np.abs(np.diff(gray, axis=1))
    center = detail[:, 120:200].mean()
    left = detail[:, :48].mean()
    right = detail[:, -48:].mean()
    if center > 0 and max(left, right) < 0.4 * center:
        return False
    return True


def build_landscape_grid_bytes(images, cols, rows):
    canvas_width, canvas_height = 1280, 720  # Lightweight 720p canvas
    cell_w, cell_h = canvas_width // cols, canvas_height // rows

    grid_canvas = Image.new("RGB", (canvas_width, canvas_height), (0, 0, 0))

    for idx, img in enumerate(images[: cols * rows]):
        cell_img = fit_width_blur_tb(img, cell_w, cell_h)
        row, col = idx // cols, idx % cols
        grid_canvas.paste(cell_img, (col * cell_w, row * cell_h))

    output_buffer = BytesIO()
    grid_canvas.save(output_buffer, format="JPEG", quality=88, optimize=True)
    val = output_buffer.getvalue()
    del grid_canvas, output_buffer
    gc.collect()
    return val


def create_16by9_grid_bytes(image_urls: list) -> bytes | None:
    if not image_urls:
        return None

    images = []
    for url in image_urls[:10]:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=8)
            if resp.status_code == 200:
                img = Image.open(BytesIO(resp.content)).convert("RGB")
                img.thumbnail((640, 640))  # Downscale to conserve VPS memory
                images.append(img)
            else:
                # Alternate frame URL fallback
                alt_url = url.replace("_0", "_") if "_0" in url else re.sub(
                    r"/frame_(\d+)\.jpg",
                    lambda m: f"/frame_{int(m.group(1)):02d}.jpg",
                    url,
                )
                if alt_url != url:
                    alt_resp = requests.get(alt_url, headers=HEADERS, timeout=8)
                    if alt_resp.status_code == 200:
                        img = Image.open(BytesIO(alt_resp.content)).convert("RGB")
                        img.thumbnail((640, 640))
                        images.append(img)
        except Exception:
            pass

    if not images:
        return None

    landscape = [t for t in (trim_black_bars(i) for i in images) if is_16by9(t)]
    if len(landscape) >= 9:
        return build_landscape_grid_bytes(landscape, cols=3, rows=3)
    if len(landscape) >= 6:
        return build_landscape_grid_bytes(landscape, cols=3, rows=2)

    canvas_width, canvas_height = 1280, 720
    cell_w, cell_h = canvas_width // 5, canvas_height // 2

    grid_canvas = Image.new("RGB", (canvas_width, canvas_height), (0, 0, 0))

    for idx, img in enumerate(images[:10]):
        content = trim_black_bars(img)
        if is_9by16(content):
            cell_img = cover_resize(content, cell_w, cell_h)
        else:
            cell_img = fit_width_blur_tb(content, cell_w, cell_h)

        row, col = idx // 5, idx % 5
        grid_canvas.paste(cell_img, (col * cell_w, row * cell_h))

    output_buffer = BytesIO()
    grid_canvas.save(output_buffer, format="JPEG", quality=88, optimize=True)
    val = output_buffer.getvalue()
    del grid_canvas, output_buffer, images
    gc.collect()
    return val


# ---------------------------------------------------------------------------
# 5. Extraction Logic
# ---------------------------------------------------------------------------


def fetch_soup(url: str):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=12)
        if resp.status_code == 200:
            return BeautifulSoup(resp.text, "html.parser"), resp.text
    except Exception as e:
        print(f"  [!] Failed to load {url}: {e}")
    return None, ""


def extract_post_links_from_page(page_url: str) -> list[str]:
    soup, _ = fetch_soup(page_url)
    if not soup:
        return []

    post_urls = []
    seen = set()

    video_blocks = soup.find_all("div", class_="video-block") or soup.find_all("article")
    for block in video_blocks:
        a_tag = block.find("a", href=True)
        if a_tag:
            href = a_tag["href"]
            full_url = urllib.parse.urljoin(BASE_DOMAIN, href)
            if full_url not in seen and "/tag/" not in full_url and "/category/" not in full_url:
                seen.add(full_url)
                post_urls.append(full_url)

    if not post_urls:
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if not href or "/page/" in href or "wp-content" in href:
                continue
            full_url = urllib.parse.urljoin(BASE_DOMAIN, href)
            if full_url not in (BASE_DOMAIN, f"{BASE_DOMAIN}/") and full_url not in seen:
                seen.add(full_url)
                post_urls.append(full_url)

    return post_urls


def extract_media_from_post(url: str):
    soup, html = fetch_soup(url)
    if not soup:
        return None, None, None, [], [], None, "Unknown"

    raw_title = soup.title.string.strip() if soup.title and soup.title.string else "Untitled"
    title = clean_title(raw_title)

    mp4_links = set()
    for tag in soup.find_all(["video", "source"]):
        src = tag.get("src")
        if src and ".mp4" in src.lower():
            mp4_links.add(urllib.parse.urljoin(url, src))

    regex_mp4 = r'https?://[^\s"\'<>]+\.mp4(?:\?[^\s"\'<>]*)?'
    for match in re.findall(regex_mp4, html, re.IGNORECASE):
        if "preview.mp4" not in match.lower():
            mp4_links.add(match)

    mp4_list = list(mp4_links)
    link_720p = None
    link_480p = None
    for link in mp4_list:
        if "_480p" in link.lower():
            link_480p = link
        else:
            link_720p = link

    duration = "Unknown"
    duration_meta = soup.find("meta", property=re.compile("duration", re.I)) or soup.find("meta", itemprop="duration")
    if duration_meta and duration_meta.get("content"):
        raw_dur = duration_meta["content"].strip()
        pt_match = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", raw_dur)
        if pt_match:
            h, m, s = pt_match.groups()
            h = int(h) if h else 0
            m = int(m) if m else 0
            s = int(s) if s else 0
            duration = f"{h:02d}:{m:02d}:{s:02d}" if h > 0 else f"{m:02d}:{s:02d}"
        else:
            duration = raw_dur
    else:
        match = re.search(r"\b(\d{1,2}:\d{2}(?::\d{2})?)\b", html)
        if match:
            duration = match.group(1)

    video_id = None
    for m_link in mp4_list:
        match = re.search(r"/(\d+)(?:_\w+)?\.mp4", m_link)
        if match:
            video_id = match.group(1)
            break
    if not video_id:
        video_id = str(int(time.time()))

    # Frames for thumbnail generation
    frame_urls = []
    full_img_divs = soup.find_all("div", class_="full-image")
    for div in full_img_divs:
        img_tag = div.find("img")
        if img_tag and img_tag.get("src"):
            src = img_tag["src"]
            if "pview" in src or "frame_" in src:
                frame_urls.append(src)

    if not frame_urls:
        regex_frames = r'https?://[^\s"\'<>]+/pview/\d+/frame_\d+\.jpg'
        frame_urls = re.findall(regex_frames, html, re.IGNORECASE)

    if not frame_urls and video_id:
        base_pview_match = re.search(r'(https?://[^\s"\'<>]+/pview/' + video_id + r')', html)
        if base_pview_match:
            base_url = base_pview_match.group(1)
            for i in range(1, 11):
                frame_urls.append(f"{base_url}/frame_{i:02d}.jpg")

    frame_urls = sorted(list(set(frame_urls)))
    return title, link_720p, link_480p, mp4_list, frame_urls, video_id, duration


# ---------------------------------------------------------------------------
# 6. Scraper Runner Loop
# ---------------------------------------------------------------------------


def process_single_post(post_url: str) -> bool:
    """Processes, extracts, and dual-syncs a single post URL."""
    existing = mongo_col.find_one({"post_url": post_url})

    # Check if existing record is already 100% complete and valid
    if existing:
        has_720 = bool(existing.get("720p_link") or existing.get("480p_link"))
        has_thumb = bool(existing.get("thumbnail_url"))
        has_title = existing.get("title") and existing.get("title") != "Untitled"
        has_dur = existing.get("duration") and existing.get("duration") != "Unknown"
        if has_720 and has_thumb and has_title and has_dur:
            return False

    title, link_720p, link_480p, all_links, frame_urls, video_id, duration = extract_media_from_post(post_url)

    if not link_720p and not link_480p and not all_links:
        return False

    # Thumbnail generation & R2 upload:
    # If existing post ALREADY has an R2 thumbnail, reuse it to prevent redundant uploads!
    if existing and existing.get("thumbnail_url") and "preview.mp4" not in existing.get("thumbnail_url"):
        thumbnail_url = existing.get("thumbnail_url")
    else:
        thumbnail_url = None
        if frame_urls:
            thumb_bytes = create_16by9_grid_bytes(frame_urls)
            if thumb_bytes:
                filename = f"{video_id}_thumb.jpg"
                r2_path = f"thumbnails/{filename}"
                thumbnail_url = upload_thumbnail_to_r2(thumb_bytes, r2_path)
                del thumb_bytes
                gc.collect()

    post_doc = {
        "site": SITE_ID,
        "domain": CURRENT_DOMAIN,
        "post_url": post_url,
        "video_id": video_id,
        "title": title,
        "duration": duration,
        "720p_link": link_720p,
        "480p_link": link_480p,
        "all_links": all_links,
        "thumbnail_url": thumbnail_url,
        "views": int(existing.get("views", 0)) if existing else 0,
        "scraped_at": existing.get("scraped_at", time.time()) if existing else time.time(),
    }

    saved = save_scraped_post(post_doc)
    if saved:
        action = "Updated" if existing else "Saved"
        print(f"  [+] {action}: {title} ({duration})")
        print(f"      -> 720p: {link_720p}")
        print(f"      -> Thumb: {thumbnail_url}")
        return True
    return False


def run_full_scan():
    """Performs an unlimited complete site scan from page 1 to the end."""
    print("==================================================")
    print(f" [{SITE_ID}] Starting Full Rescan: {BASE_DOMAIN}")
    print("==================================================\n")

    page_num = 1
    total_new = 0

    while True:
        page_url = START_PAGE_URL if page_num == 1 else f"{BASE_DOMAIN}/page/{page_num}/"
        print(f"\n--- [PAGE {page_num}] Fetching: {page_url} ---")
        post_urls = extract_post_links_from_page(page_url)

        if not post_urls:
            print(f"\n[!] Page {page_num} returned 0 posts. Reached end of site.")
            break

        print(f"Found {len(post_urls)} posts on page {page_num}.")
        page_new = 0
        for post_url in post_urls:
            if process_single_post(post_url):
                page_new += 1
                total_new += 1
            time.sleep(0.3)

        # Update scraper_sites telemetry
        sites_col.update_one(
            {"site_id": SITE_ID},
            {"$set": {"last_run_at": datetime.utcnow(), "last_new_posts": page_new, "status": "idle"}},
            upsert=True,
        )

        page_num += 1
        gc.collect()
        time.sleep(1.0)

    print(f"\n[✓] Full scan complete! Total posts processed/updated: {total_new}")


def run_live_monitor():
    """Continuously monitors page 1 for new releases."""
    print("\n==================================================")
    print(f" [{SITE_ID}] Entering Live Monitoring Mode...")
    print("==================================================\n")

    while True:
        try:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking latest updates on {START_PAGE_URL}...")
            post_urls = extract_post_links_from_page(START_PAGE_URL)

            new_count = 0
            if post_urls:
                for post_url in post_urls:
                    if process_single_post(post_url):
                        new_count += 1
                    time.sleep(0.3)

            if new_count > 0:
                print(f"  [+] {new_count} new posts saved.")
                sites_col.update_one(
                    {"site_id": SITE_ID},
                    {"$set": {"last_run_at": datetime.utcnow(), "last_new_posts": new_count}},
                    upsert=True,
                )
            else:
                print("  [-] No new posts found. Sleeping...")

        except Exception as e:
            print(f"  [!] Live monitoring error: {e}")

        gc.collect()
        time.sleep(120)  # Check every 2 minutes


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("--once", "-1", "incremental"):
        print(f"[{SITE_ID}] Running single incremental pass...")
        urls = extract_post_links_from_page(START_PAGE_URL)
        saved_count = sum(1 for u in urls if process_single_post(u))
        print(f"[{SITE_ID}] Single pass finished. {saved_count} new/updated posts.")
        sys.exit(0)

    # By default, run full scan first, then continue in live monitoring mode
    run_full_scan()
    run_live_monitor()
