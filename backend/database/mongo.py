"""
MongoDB async client — motor wrapper.
Collections:
  scrape_queue      – pending URLs to scrape
  monitor_jobs      – per-site monitoring config
  scan_history      – log of every scan run
  crawler_temp      – transient crawl state
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
