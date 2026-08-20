"""
Cloudflare D1 client via REST API.
Docs: https://developers.cloudflare.com/api/operations/cloudflare-d1-query-database
"""
import httpx
import logging
from config.settings import settings

logger = logging.getLogger(__name__)

D1_BASE = (
    f"https://api.cloudflare.com/client/v4/accounts/{settings.CF_ACCOUNT_ID}"
    f"/d1/database/{settings.CF_D1_DATABASE_ID}/query"
)

HEADERS = {
    "Authorization": f"Bearer {settings.CF_API_TOKEN}",
    "Content-Type": "application/json",
}


async def d1_query(sql: str, params: list | None = None) -> dict:
    """Execute a parameterised SQL statement against D1."""
    payload = {"sql": sql, "params": params or []}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(D1_BASE, headers=HEADERS, json=payload)
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            raise RuntimeError(f"D1 error: {data.get('errors')}")
        return data["result"][0] if data["result"] else {}


async def ensure_schema():
    """Create D1 tables if they don't exist yet."""
    ddl = """
    CREATE TABLE IF NOT EXISTS videos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        slug        TEXT    NOT NULL UNIQUE,
        thumbnail   TEXT,
        thumbnail_2 TEXT,
        video_link  TEXT    NOT NULL,
        type        TEXT    NOT NULL CHECK(type IN ('mp4','blogger')),
        views       INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sites (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        url             TEXT    NOT NULL UNIQUE,
        last_scanned_at TEXT,
        last_post_url   TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS visitors (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ip         TEXT,
        visited_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """
    for stmt in ddl.strip().split(";"):
        stmt = stmt.strip()
        if stmt:
            await d1_query(stmt)
    logger.info("D1 schema ready")


# ── Video CRUD ────────────────────────────────────────────────────────────────

async def insert_video(title, slug, thumbnail, video_link, vtype) -> int:
    """Insert a video row; retries with a new slug on UNIQUE collision (up to 5x)."""
    # Import here to avoid circular imports
    from backend.utils.slug import generate_slug

    for attempt in range(5):
        try:
            r = await d1_query(
                "INSERT INTO videos (title, slug, thumbnail, video_link, type) "
                "VALUES (?, ?, ?, ?, ?) RETURNING id",
                [title, slug, thumbnail, video_link, vtype],
            )
            return r.get("results", [{}])[0].get("id")
        except Exception as e:
            if "UNIQUE" in str(e).upper() and attempt < 4:
                slug = generate_slug(title)   # regenerate and retry
                logger.warning(f"Slug collision, retrying with: {slug}")
                continue
            raise


async def list_videos(page=1, per_page=50, search="", vtype="") -> dict:
    offset = (page - 1) * per_page
    where_parts = []
    params = []
    if search:
        where_parts.append("(title LIKE ? OR slug LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    if vtype:
        where_parts.append("type = ?")
        params.append(vtype)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    count_r = await d1_query(f"SELECT COUNT(*) as cnt FROM videos {where}", params)
    total = count_r.get("results", [{}])[0].get("cnt", 0)
    rows_r = await d1_query(
        f"SELECT * FROM videos {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [per_page, offset],
    )
    return {"total": total, "rows": rows_r.get("results", [])}


async def get_video(vid: int) -> dict | None:
    r = await d1_query("SELECT * FROM videos WHERE id = ?", [vid])
    rows = r.get("results", [])
    return rows[0] if rows else None


async def update_video(vid: int, fields: dict) -> bool:
    allowed = {"title", "slug", "thumbnail", "thumbnail_2", "video_link", "type"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    params = list(updates.values()) + [vid]
    await d1_query(f"UPDATE videos SET {set_clause} WHERE id = ?", params)
    return True


async def delete_video(vid: int):
    await d1_query("DELETE FROM videos WHERE id = ?", [vid])


async def delete_videos_bulk(ids: list[int]):
    placeholders = ",".join("?" * len(ids))
    await d1_query(f"DELETE FROM videos WHERE id IN ({placeholders})", ids)


async def increment_views(slug: str):
    await d1_query("UPDATE videos SET views = views + 1 WHERE slug = ?", [slug])


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats() -> dict:
    r = await d1_query("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN type='mp4'     THEN 1 ELSE 0 END) as mp4,
            SUM(CASE WHEN type='blogger' THEN 1 ELSE 0 END) as blogger,
            SUM(views) as total_views
        FROM videos
    """)
    row = r.get("results", [{}])[0]
    sites_r = await d1_query("SELECT COUNT(*) as cnt FROM sites")
    visitors_r = await d1_query("SELECT COUNT(DISTINCT ip) as cnt FROM visitors")
    return {
        "total_videos": row.get("total", 0),
        "total_mp4": row.get("mp4", 0),
        "total_blogger": row.get("blogger", 0),
        "total_views": row.get("total_views", 0) or 0,
        "total_visitors": visitors_r.get("results", [{}])[0].get("cnt", 0),
        "monitoring_sites": sites_r.get("results", [{}])[0].get("cnt", 0),
    }


# ── Sites ─────────────────────────────────────────────────────────────────────

async def list_sites() -> list:
    r = await d1_query("SELECT * FROM sites ORDER BY created_at DESC")
    return r.get("results", [])


async def upsert_site(url: str):
    await d1_query(
        "INSERT INTO sites (url) VALUES (?) ON CONFLICT(url) DO NOTHING", [url]
    )


async def update_site_scan(url: str, last_post_url: str | None = None):
    await d1_query(
        "UPDATE sites SET last_scanned_at = datetime('now'), last_post_url = ? WHERE url = ?",
        [last_post_url, url],
    )
