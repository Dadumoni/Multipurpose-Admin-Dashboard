"""
Lightweight async scheduler for 24-hour site monitoring.
Runs in the FastAPI lifespan as a background task.
"""
import asyncio
import logging
import time
import uuid

from backend.database import d1, mongo
from backend.scraper.extractor import crawl_site
from config.settings import settings

logger = logging.getLogger(__name__)

_running_jobs: dict[str, asyncio.Task] = {}
_next_scan: dict[str, float] = {}   # site_url → unix timestamp of next scan


async def schedule_loop():
    """Main loop: checks every minute if any site is due for a scan."""
    while True:
        try:
            sites = await d1.list_sites()
            now = time.time()
            for site in sites:
                url = site["url"]
                due = _next_scan.get(url, 0)
                if now >= due and url not in _running_jobs:
                    logger.info(f"Scheduler triggering scan: {url}")
                    _next_scan[url] = now + settings.MONITOR_INTERVAL
                    job_id = str(uuid.uuid4())
                    task = asyncio.create_task(
                        _run_monitored(url, site.get("last_post_url"), job_id)
                    )
                    _running_jobs[url] = task
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")

        await asyncio.sleep(60)


async def _run_monitored(url: str, last_post_url: str | None, job_id: str):
    try:
        # Register the job in MongoDB
        col = await mongo.col_monitor()
        await col.update_one(
            {"url": url},
            {"$set": {"status": "running", "job_id": job_id, "started_at": time.time()}},
            upsert=True,
        )
        await crawl_site(url, last_post_url, job_id)
        await col.update_one(
            {"url": url},
            {"$set": {"status": "idle", "last_run": time.time()}},
        )
    except Exception as e:
        logger.error(f"Monitor job failed ({url}): {e}")
    finally:
        _running_jobs.pop(url, None)


def get_next_scans() -> dict[str, float]:
    return dict(_next_scan)


def trigger_scan_now(url: str, last_post_url: str | None = None) -> str:
    """Manually trigger an immediate scan; returns job_id."""
    job_id = str(uuid.uuid4())
    _next_scan[url] = time.time() + settings.MONITOR_INTERVAL
    task = asyncio.create_task(_run_monitored(url, last_post_url, job_id))
    _running_jobs[url] = task
    return job_id
