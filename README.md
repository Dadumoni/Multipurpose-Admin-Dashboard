# Multipurpose Tool — Admin Dashboard

Backend-first admin for scraping, storing, and monitoring video links from Blogger/WordPress sites.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+ · FastAPI · uvicorn |
| Task queue / temp state | MongoDB (motor async) |
| Production database | Cloudflare D1 (REST API) |
| Thumbnail storage | Cloudflare R2 (S3-compatible) |
| Frontend | Vanilla HTML · CSS · JavaScript (no build step) |

---

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd multipurpose-tool
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required values:

| Key | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | D1 database ID |
| `CF_API_TOKEN` | Cloudflare API token (D1 + R2 permissions) |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY` | R2 access key ID |
| `R2_SECRET_KEY` | R2 secret access key |
| `R2_PUBLIC_URL` | Public CDN base URL for R2 bucket |

### 3. Run

```bash
python run.py
# Open http://localhost:8000
```

---

## Project Structure

```
multipurpose-tool/
├── main.py                    # FastAPI app + lifespan
├── run.py                     # Entry point (loads .env)
├── requirements.txt
├── config/
│   └── settings.py            # All config from env vars
├── backend/
│   ├── api/
│   │   └── routes.py          # All REST endpoints (/api/*)
│   ├── database/
│   │   ├── mongo.py           # MongoDB async client (motor)
│   │   └── d1.py              # Cloudflare D1 REST client
│   ├── scraper/
│   │   └── extractor.py       # Crawl + extract + save pipeline
│   ├── scheduler.py           # 24h monitoring loop
│   ├── storage/
│   │   └── r2.py              # R2 upload/delete
│   └── utils/
│       └── slug.py            # 15–20 char slug generator
└── frontend/
    ├── index.html             # SPA shell
    └── static/
        ├── css/app.css
        └── js/
            ├── api.js         # All API calls
            ├── app.js         # Router + shared utilities
            └── pages/
                ├── overview.js
                ├── links.js
                ├── scraper.js
                └── monitor.js
```

---

## API Reference

### Overview
| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard counts |

### Videos
| Method | Path | Description |
|---|---|---|
| GET | `/api/videos` | Paginated list (search, type filter) |
| GET | `/api/videos/:id` | Single video |
| PATCH | `/api/videos/:id` | Update metadata |
| DELETE | `/api/videos/:id` | Delete |
| POST | `/api/videos/bulk-delete` | `{ ids: [...] }` |
| POST | `/api/videos/:id/thumbnail` | Multipart upload → R2 |

### Scraper
| Method | Path | Description |
|---|---|---|
| POST | `/api/scrape/start` | `{ url }` → `{ job_id }` |
| GET | `/api/scrape/status/:job_id` | Live progress |
| GET | `/api/scrape/active` | All running jobs |

### Monitoring
| Method | Path | Description |
|---|---|---|
| GET | `/api/monitor/sites` | All sites + next_scan_in (seconds) |
| POST | `/api/monitor/scan-now` | `{ url }` → triggers immediate scan |
| GET | `/api/monitor/history` | Scan history from MongoDB |

---

## Scraping Logic

1. **Discover posts** — tries Blogger Atom feed first, falls back to sitemap.xml
2. **Per post** (with 10s delay):
   - Fetch HTML
   - Extract title, thumbnail (og:image → first img)
   - Extract MP4 links (direct `.mp4` URLs) and Blogger native player links
   - Download thumbnail → upload to R2 `Thumbnails/`
   - Insert one D1 row per video link (same title + thumbnail, different slug)
3. **Progress** streamed to MongoDB `crawler_temp` collection, polled by frontend every 2s

### Slug format
Letters + digits + underscore, 15–20 characters:
```
title_prefix_rnd4z
```

### Multiple videos per post
Each video link gets its own row with a unique slug:
```
video_title_abc12  →  https://...mp4
video_title_xyz99  →  https://video.blogger.com/...
```

---

## D1 Schema

```sql
CREATE TABLE videos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE,
    thumbnail   TEXT,          -- R2 URL (original upload)
    thumbnail_2 TEXT,          -- R2 URL (manually replaced)
    video_link  TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('mp4','blogger')),
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sites (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT    NOT NULL UNIQUE,
    last_scanned_at TEXT,
    last_post_url   TEXT,    -- resume point for incremental scans
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE visitors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT,
    visited_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `scrape_queue` | Pending URL jobs |
| `monitor_jobs` | Per-site status + last run |
| `scan_history` | Log of completed scans |
| `crawler_temp` | Live progress state per job |
# Multipurpose-Admin-Dashboard
