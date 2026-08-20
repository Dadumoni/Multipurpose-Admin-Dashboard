"""
health_check.py — Koyeb Free Tier Sleep Prevention
===================================================
Yeh module FastAPI lifespan ke saath run hota hai.
Har HEALTH_PING_INTERVAL seconds (default: 29 min) me apne aap ko
/health endpoint pe ping karta hai taaki Koyeb service sleep na ho.

Kaise kaam karta hai:
  1. App start hone pe keep_alive_loop() background task ke roop me chalta hai
  2. Har 29 minute me GET /health call karta hai
  3. Response ka status aur latency log karta hai
  4. SELF_URL set na ho to silently skip karta hai (local dev me ignore hoga)

Setup:
  .env me SELF_URL=https://your-app.koyeb.app set karo
"""

import asyncio
import logging
import time

import httpx

from config.settings import settings

logger = logging.getLogger("health_check")


async def keep_alive_loop() -> None:
    """
    Infinite loop — har interval ke baad /health endpoint ping karta hai.
    FastAPI lifespan me asyncio.create_task() se start karo.
    """
    if not settings.SELF_URL:
        logger.info(
            "Keep-alive: SELF_URL set nahi hai — self-ping disabled. "
            "Koyeb pe deploy karne ke baad SELF_URL env var set karo."
        )
        return

    target = settings.SELF_URL.rstrip("/") + "/health"
    interval = settings.HEALTH_PING_INTERVAL

    logger.info(
        f"Keep-alive started — target: {target} | "
        f"interval: {interval}s ({interval // 60}m {interval % 60}s)"
    )

    # Pehla ping 30 second baad karo (server fully up hone ka wait)
    await asyncio.sleep(30)

    while True:
        await _ping(target)
        await asyncio.sleep(interval)


async def _ping(url: str) -> None:
    """Ek HTTP GET request bhejta hai aur result log karta hai."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, follow_redirects=True)
        latency_ms = int((time.monotonic() - start) * 1000)

        if r.status_code == 200:
            logger.info(f"Keep-alive ping OK — {r.status_code} | latency: {latency_ms}ms")
        else:
            logger.warning(
                f"Keep-alive ping unexpected status — {r.status_code} | latency: {latency_ms}ms"
            )
    except httpx.TimeoutException:
        logger.warning("Keep-alive ping timeout (15s) — server slow ya down ho sakta hai")
    except Exception as e:
        logger.error(f"Keep-alive ping failed — {type(e).__name__}: {e}")
