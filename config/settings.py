"""
Central configuration — all secrets come from environment variables.
Copy .env.example to .env and fill in your values.
"""
import os
from dataclasses import dataclass


@dataclass
class Settings:
    # ── MongoDB ──────────────────────────────────────────────────────────────
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB:  str = os.getenv("MONGO_DB",  "multipurpose_tool")

    # ── Cloudflare D1 (via REST API) ─────────────────────────────────────────
    CF_ACCOUNT_ID:    str = os.getenv("CF_ACCOUNT_ID",    "")
    CF_D1_DATABASE_ID: str = os.getenv("CF_D1_DATABASE_ID", "")
    CF_API_TOKEN:     str = os.getenv("CF_API_TOKEN",     "")

    # ── Cloudflare R2 (S3-compatible) ────────────────────────────────────────
    R2_ENDPOINT:   str = os.getenv("R2_ENDPOINT",   "")   # https://<account>.r2.cloudflarestorage.com
    R2_ACCESS_KEY: str = os.getenv("R2_ACCESS_KEY", "")
    R2_SECRET_KEY: str = os.getenv("R2_SECRET_KEY", "")
    R2_BUCKET:     str = os.getenv("R2_BUCKET",     "thumbnails")
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "")   # public CDN base URL

    # ── Scraper ───────────────────────────────────────────────────────────────
    SCRAPE_DELAY:     int = int(os.getenv("SCRAPE_DELAY",     "10"))    # seconds between posts
    MONITOR_INTERVAL: int = int(os.getenv("MONITOR_INTERVAL", "86400")) # 24h in seconds

    # ── App ───────────────────────────────────────────────────────────────────
    HOST:  str  = os.getenv("HOST",  "0.0.0.0")
    PORT:  int  = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # ── Keep-alive self-ping (Koyeb free tier sleep prevention) ──────────────
    # Apni Koyeb service ka public URL set karo
    # Example: https://my-app-yourname.koyeb.app
    SELF_URL: str = os.getenv("SELF_URL", "")
    # Kitne seconds me ek baar ping kare (default 29 min — Koyeb 30 min timeout se pehle)
    HEALTH_PING_INTERVAL: int = int(os.getenv("HEALTH_PING_INTERVAL", "1740"))


settings = Settings()
