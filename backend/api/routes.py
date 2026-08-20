"""
All REST API routes — mounted at /api.
"""
import asyncio
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.database import d1, mongo
from backend.scraper.extractor import crawl_site, scrape_post
from backend.scheduler import get_next_scans, trigger_scan_now
from backend.storage.r2 import delete_thumbnail, upload_thumbnail
from backend.utils.slug import generate_slug

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    return await d1.get_stats()


# ── Videos ────────────────────────────────────────────────────────────────────

@router.get("/videos")
async def list_videos(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query(""),
    type: str = Query(""),
):
    return await d1.list_videos(page, per_page, search, type)


@router.get("/videos/{vid}")
async def get_video(vid: int):
    row = await d1.get_video(vid)
    if not row:
        raise HTTPException(404, "Video not found")
    return row


@router.patch("/videos/{vid}")
async def update_video(vid: int, data: dict):
    ok = await d1.update_video(vid, data)
    if not ok:
        raise HTTPException(400, "Nothing to update")
    return {"ok": True}


@router.delete("/videos/{vid}")
async def delete_video(vid: int):
    await d1.delete_video(vid)
    return {"ok": True}


@router.post("/videos/bulk-delete")
async def bulk_delete(data: dict):
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "No ids provided")
    await d1.delete_videos_bulk(ids)
    return {"ok": True, "deleted": len(ids)}


@router.post("/videos/{vid}/thumbnail")
async def upload_video_thumbnail(
    vid: int,
    file: UploadFile = File(...),
    delete_original: bool = Form(False),
):
    row = await d1.get_video(vid)
    if not row:
        raise HTTPException(404, "Video not found")

    data = await file.read()
    r2_url = await upload_thumbnail(data, file.filename, file.content_type or "image/jpeg")

    update_data = {"thumbnail_2": r2_url}
    if delete_original and row.get("thumbnail"):
        await delete_thumbnail(row["thumbnail"])
        update_data["thumbnail"] = r2_url

    await d1.update_video(vid, update_data)
    return {"ok": True, "thumbnail_2": r2_url}


# ── Scraper ───────────────────────────────────────────────────────────────────

_active_scrapes: dict[str, dict] = {}


class ScrapeRequest(BaseModel):
    url: str


@router.post("/scrape/start")
async def start_scrape(req: ScrapeRequest, background_tasks: BackgroundTasks):
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL required")

    for job in _active_scrapes.values():
        if job["url"] == url and job["status"] == "running":
            return {"job_id": job["job_id"], "message": "Already running"}

    job_id = str(uuid.uuid4())
    _active_scrapes[job_id] = {"job_id": job_id, "url": url, "status": "running", "started_at": time.time()}

    background_tasks.add_task(_run_scrape, job_id, url)
    await d1.upsert_site(url)

    return {"job_id": job_id, "message": "Scrape started"}


async def _run_scrape(job_id: str, url: str):
    try:
        await crawl_site(url, job_id=job_id)
        _active_scrapes[job_id]["status"] = "done"
    except Exception as e:
        logger.error(f"Scrape job {job_id} failed: {e}")
        _active_scrapes[job_id]["status"] = "error"
        _active_scrapes[job_id]["error"] = str(e)


@router.get("/scrape/status/{job_id}")
async def scrape_status(job_id: str):
    temp_col = await mongo.col_temp()
    doc = await temp_col.find_one({"job_id": job_id})
    if doc:
        doc.pop("_id", None)
        if job_id in _active_scrapes:
            doc["status"] = _active_scrapes[job_id]["status"]
        return doc

    if job_id in _active_scrapes:
        return _active_scrapes[job_id]

    raise HTTPException(404, "Job not found")


@router.get("/scrape/active")
async def active_scrapes():
    return list(_active_scrapes.values())


# ── Site Settings (custom scrape pattern per site) ────────────────────────────

@router.get("/scrape/settings")
async def get_scrape_settings(url: str = Query(...)):
    """Get per-site custom scrape settings."""
    return await mongo.get_site_settings(url)


@router.post("/scrape/settings")
async def save_scrape_settings(data: dict):
    """Save per-site custom scrape settings."""
    site_url = data.get("site_url", "").strip()
    if not site_url:
        raise HTTPException(400, "site_url required")
    saved = await mongo.save_site_settings(site_url, data)
    return {"ok": True, "settings": saved}


# ── Site Monitoring ───────────────────────────────────────────────────────────

@router.get("/monitor/sites")
async def monitor_sites():
    sites = await d1.list_sites()
    next_scans = get_next_scans()
    now = time.time()
    result = []
    for site in sites:
        url = site["url"]
        next_ts = next_scans.get(url)
        result.append({
            **site,
            "next_scan_in": max(0, int(next_ts - now)) if next_ts else None,
        })
    return result


@router.post("/monitor/scan-now")
async def scan_now(data: dict):
    url = data.get("url", "").strip()
    if not url:
        raise HTTPException(400, "URL required")
    sites = await d1.list_sites()
    site = next((s for s in sites if s["url"] == url), None)
    last_post = site.get("last_post_url") if site else None
    job_id = trigger_scan_now(url, last_post)
    return {"job_id": job_id, "message": "Scan triggered"}


@router.get("/monitor/history")
async def scan_history(limit: int = Query(50, ge=1, le=500)):
    col = await mongo.col_history()
    cursor = col.find().sort("finished_at", -1).limit(limit)
    rows = []
    async for doc in cursor:
        doc.pop("_id", None)
        rows.append(doc)
    return rows


@router.delete("/monitor/sites")
async def remove_site(data: dict):
    url = data.get("url", "").strip()
    if not url:
        raise HTTPException(400, "URL required")
    await d1.d1_query("DELETE FROM sites WHERE url = ?", [url])
    return {"ok": True}


# ── Thumbnail-only delete ─────────────────────────────────────────────────────

@router.delete("/videos/{vid}/thumbnail")
async def delete_video_thumbnail(vid: int, which: str = Query("original")):
    row = await d1.get_video(vid)
    if not row:
        raise HTTPException(404, "Video not found")

    field = "thumbnail" if which == "original" else "thumbnail_2"
    url = row.get(field)
    if url:
        await delete_thumbnail(url)
    await d1.update_video(vid, {field: None})
    return {"ok": True}


# ── Visitor tracking ──────────────────────────────────────────────────────────

from fastapi import Request as FastAPIRequest

@router.post("/track/visit")
async def track_visit(request: FastAPIRequest):
    ip = request.client.host if request.client else "unknown"
    await d1.d1_query("INSERT INTO visitors (ip) VALUES (?)", [ip])
    return {"ok": True}


# ── Slug utils ────────────────────────────────────────────────────────────────

@router.get("/videos/check-slug")
async def check_slug(slug: str = Query(...)):
    r = await d1.d1_query("SELECT id FROM videos WHERE slug = ?", [slug])
    exists = bool(r.get("results"))
    return {"slug": slug, "available": not exists}


@router.get("/utils/slug")
async def new_slug(title: str = Query("")):
    from backend.utils.slug import generate_slug
    return {"slug": generate_slug(title or None)}
