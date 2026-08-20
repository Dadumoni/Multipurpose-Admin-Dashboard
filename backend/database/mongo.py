"""
MongoDB async client — motor wrapper.
Collections:
  scrape_queue      – pending URLs to scrape
  monitor_jobs      – per-site monitoring config
  scan_history      – log of every scan run
  crawler_temp      – transient crawl state
  site_settings     – per-site custom scrape pattern config (NEW)
"""
from motor.motor_asyncio import AsyncIOMotorClient
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


async def get_db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGO_URI)
        logger.info("MongoDB connected")
    return _client[settings.MONGO_DB]


async def close_db():
    global _client
    if _client:
        _client.close()
        _client = None


# ── Collection helpers ────────────────────────────────────────────────────────

async def col_queue():
    db = await get_db()
    return db["scrape_queue"]

async def col_monitor():
    db = await get_db()
    return db["monitor_jobs"]

async def col_history():
    db = await get_db()
    return db["scan_history"]

async def col_temp():
    db = await get_db()
    return db["crawler_temp"]

async def col_site_settings():
    db = await get_db()
    return db["site_settings"]


# ── Site Settings helpers ─────────────────────────────────────────────────────

async def get_site_settings(site_url: str) -> dict:
    """
    Returns custom scrape settings for a site, or defaults if none saved.
    Schema:
      {
        site_url: str,
        custom_mode: bool,          # True = custom pattern enabled
        video_pattern: str,         # regex or URL template for video link
        poster_keep_default: bool,  # True = use default thumbnail logic
        poster_pattern: str,        # regex or URL template for poster (if not default)
      }
    """
    col = await col_site_settings()
    doc = await col.find_one({"site_url": site_url})
    if doc:
        doc.pop("_id", None)
        return doc
    return {
        "site_url": site_url,
        "custom_mode": False,
        "video_pattern": "",
        "poster_keep_default": True,
        "poster_pattern": "",
    }


async def save_site_settings(site_url: str, data: dict) -> dict:
    """Upsert site settings. Returns the saved doc."""
    col = await col_site_settings()
    payload = {
        "site_url": site_url,
        "custom_mode": bool(data.get("custom_mode", False)),
        "video_pattern": str(data.get("video_pattern", "")).strip(),
        "poster_keep_default": bool(data.get("poster_keep_default", True)),
        "poster_pattern": str(data.get("poster_pattern", "")).strip(),
    }
    await col.update_one(
        {"site_url": site_url},
        {"$set": payload},
        upsert=True,
    )
    return payload
