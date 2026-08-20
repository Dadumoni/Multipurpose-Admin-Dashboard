"""
Multipurpose Tool — FastAPI application entry point.
"""
import asyncio
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Root ko importable banao
sys.path.insert(0, str(Path(__file__).parent))

from backend.api.routes import router
from backend.database.d1 import ensure_schema
from backend.database.mongo import close_db
from backend.scheduler import schedule_loop
from health_check import keep_alive_loop
from config.settings import settings

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")

# App start time (uptime calculate karne ke liye)
_START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    logger.info("Starting Multipurpose Tool...")

    # D1 schema init (credentials na ho to skip)
    if settings.CF_ACCOUNT_ID and settings.CF_D1_DATABASE_ID:
        try:
            await ensure_schema()
        except Exception as e:
            logger.warning(f"D1 schema init failed: {e}")
    else:
        logger.warning("Cloudflare D1 configured nahi — schema init skip")

    # Background tasks start karo
    scheduler_task  = asyncio.create_task(schedule_loop(),    name="scheduler")
    keep_alive_task = asyncio.create_task(keep_alive_loop(),  name="keep_alive")

    logger.info("Scheduler + Keep-alive started")

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    scheduler_task.cancel()
    keep_alive_task.cancel()
    try:
        await asyncio.gather(scheduler_task, keep_alive_task, return_exceptions=True)
    except Exception:
        pass
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

# ── Health check endpoint (Koyeb ke liye) ─────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    """
    Koyeb health check + self-ping dono ke liye.
    200 OK return karta hai with basic uptime info.
    """
    uptime_seconds = int(time.time() - _START_TIME)
    hours, rem     = divmod(uptime_seconds, 3600)
    minutes, secs  = divmod(rem, 60)
    return JSONResponse(
        status_code=200,
        content={
            "status":  "ok",
            "service": "multipurpose-tool",
            "uptime":  f"{hours}h {minutes}m {secs}s",
            "uptime_seconds": uptime_seconds,
        },
    )

# ── Readiness probe (Koyeb startup check ke liye) ────────────────────────────
@app.get("/ready", tags=["health"])
async def readiness():
    """Koyeb startup probe — app ready hai to 200 return karo."""
    return JSONResponse(status_code=200, content={"ready": True})

# ── API routes ────────────────────────────────────────────────────────────────
app.include_router(router, prefix="/api")

# ── Static files ──────────────────────────────────────────────────────────────
FRONTEND = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND / "static")), name="static")


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_spa(request: Request, full_path: str):
    """SPA ke liye saare non-API routes index.html serve karte hain."""
    return FileResponse(str(FRONTEND / "index.html"))
