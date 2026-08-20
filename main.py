"""
Multipurpose Tool — FastAPI application entry point.
"""
import asyncio
import logging
import sys
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# Ensure root is importable
sys.path.insert(0, str(Path(__file__).parent))

from backend.api.routes import router
from backend.database.d1 import ensure_schema
from backend.database.mongo import close_db
from backend.scheduler import schedule_loop
from config.settings import settings

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    logger.info("Starting Multipurpose Tool...")

    # Ensure D1 schema exists (skip if not configured)
    if settings.CF_ACCOUNT_ID and settings.CF_D1_DATABASE_ID:
        try:
            await ensure_schema()
        except Exception as e:
            logger.warning(f"D1 schema init failed (check CF credentials): {e}")
    else:
        logger.warning("Cloudflare D1 not configured — skipping schema init")

    # Start monitoring scheduler
    scheduler_task = asyncio.create_task(schedule_loop())
    logger.info("Scheduler started")

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────
    scheduler_task.cancel()
    await close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Multipurpose Tool",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ────────────────────────────────────────────────────────────────
app.include_router(router, prefix="/api")

# ── Static files ──────────────────────────────────────────────────────────────
FRONTEND = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND / "static")), name="static")


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_spa(request: Request, full_path: str):
    """Serve the SPA for all non-API routes."""
    index = FRONTEND / "index.html"
    return FileResponse(str(index))
