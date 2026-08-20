import {
  json, ok, error,
  generateUniqueSlug,
  uploadThumbnailToR2,
  addHours,
} from './utils.js';

// ─── Overview Stats ──────────────────────────────────────────────────────────
export async function handleOverview(db) {
  const [totals, byType, sites, views, visitors] = await Promise.all([
    db.prepare('SELECT COUNT(*) as total FROM videos').first(),
    db.prepare("SELECT type, COUNT(*) as count FROM videos GROUP BY type").all(),
    db.prepare('SELECT COUNT(*) as total FROM sites').first(),
    db.prepare('SELECT COALESCE(SUM(views),0) as total FROM videos').first(),
    db.prepare('SELECT COUNT(*) as total FROM visitors').first(),
  ]);

  const byTypeMap = { mp4: 0, blogger: 0 };
  for (const row of (byType.results || [])) byTypeMap[row.type] = row.count;

  return ok({
    stats: {
      total_videos: totals?.total ?? 0,
      total_mp4: byTypeMap.mp4,
      total_blogger: byTypeMap.blogger,
      total_views: views?.total ?? 0,
      total_visitors: visitors?.total ?? 0,
      monitoring_sites: sites?.total ?? 0,
    },
  });
}

// ─── Videos CRUD ─────────────────────────────────────────────────────────────
export async function handleVideos(request, db, env) {
  const url = new URL(request.url);
  const method = request.method;

  // GET /api/videos — paginated list
  if (method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const type = url.searchParams.get('type');
    const search = url.searchParams.get('search');
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const binds = [];

    if (type && (type === 'mp4' || type === 'blogger')) {
      where += ' AND type = ?';
      binds.push(type);
    }
    if (search) {
      where += ' AND (title LIKE ? OR slug LIKE ?)';
      binds.push(`%${search}%`, `%${search}%`);
    }

    const countQ = db.prepare(`SELECT COUNT(*) as total FROM videos ${where}`).bind(...binds);
    const rowsQ = db.prepare(
      `SELECT * FROM videos ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset);

    const [countRes, rowsRes] = await Promise.all([countQ.first(), rowsQ.all()]);

    return ok({
      videos: rowsRes.results || [],
      pagination: {
        total: countRes?.total ?? 0,
        page,
        limit,
        pages: Math.ceil((countRes?.total ?? 0) / limit),
      },
    });
  }

  // POST /api/videos — create
  if (method === 'POST') {
    const body = await request.json();
    const { title, video_link, type, thumbnail_url, thumbnail_2_url } = body;

    if (!title || !video_link || !type) return error('title, video_link, type required');
    if (!['mp4', 'blogger'].includes(type)) return error('type must be mp4 or blogger');

    const slug = await generateUniqueSlug(db);

    await db.prepare(
      `INSERT INTO videos (title, slug, thumbnail_url, thumbnail_2_url, video_link, type)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(title, slug, thumbnail_url || null, thumbnail_2_url || null, video_link, type).run();

    return ok({ slug });
  }

  return error('Method not allowed', 405);
}

export async function handleVideo(request, db, env, slug) {
  const method = request.method;

  // GET /api/videos/:slug
  if (method === 'GET') {
    const row = await db.prepare('SELECT * FROM videos WHERE slug = ?').bind(slug).first();
    if (!row) return error('Not found', 404);
    // Increment views
    await db.prepare('UPDATE videos SET views = views + 1 WHERE slug = ?').bind(slug).run();
    return ok({ video: row });
  }

  // PUT /api/videos/:slug — update
  if (method === 'PUT') {
    const existing = await db.prepare('SELECT * FROM videos WHERE slug = ?').bind(slug).first();
    if (!existing) return error('Not found', 404);

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle thumbnail upload
      const formData = await request.formData();
      const file = formData.get('thumbnail');
      const title = formData.get('title');
      const video_link = formData.get('video_link');
      const type = formData.get('type');
      const delete_original = formData.get('delete_original') === 'true';

      let thumbnail_2_url = existing.thumbnail_2_url;

      if (file && file.size > 0) {
        const ext = file.type?.includes('png') ? 'png' : file.type?.includes('webp') ? 'webp' : 'jpg';
        const key = `thumbnails/${slug}_custom.${ext}`;
        const buffer = await file.arrayBuffer();
        await env.R2.put(key, buffer, {
          httpMetadata: { contentType: file.type || 'image/jpeg' },
        });
        thumbnail_2_url = `${env.R2_PUBLIC_URL}/${key}`;
      }

      const thumbnail_url = delete_original ? null : existing.thumbnail_url;

      await db.prepare(
        `UPDATE videos SET title=?, video_link=?, type=?, thumbnail_url=?, thumbnail_2_url=?, updated_at=CURRENT_TIMESTAMP
         WHERE slug=?`
      ).bind(
        title || existing.title,
        video_link || existing.video_link,
        type || existing.type,
        thumbnail_url,
        thumbnail_2_url,
        slug
      ).run();

      return ok({ thumbnail_2_url });
    } else {
      // JSON update
      const body = await request.json();
      const { title, video_link, type, thumbnail_url, thumbnail_2_url } = body;

      await db.prepare(
        `UPDATE videos SET title=?, video_link=?, type=?, thumbnail_url=?, thumbnail_2_url=?, updated_at=CURRENT_TIMESTAMP
         WHERE slug=?`
      ).bind(
        title ?? existing.title,
        video_link ?? existing.video_link,
        type ?? existing.type,
        thumbnail_url ?? existing.thumbnail_url,
        thumbnail_2_url ?? existing.thumbnail_2_url,
        slug
      ).run();

      return ok({});
    }
  }

  // DELETE /api/videos/:slug
  if (method === 'DELETE') {
    await db.prepare('DELETE FROM videos WHERE slug = ?').bind(slug).run();
    return ok({});
  }

  return error('Method not allowed', 405);
}

// Bulk delete
export async function handleBulkDelete(request, db) {
  const { slugs } = await request.json();
  if (!Array.isArray(slugs) || slugs.length === 0) return error('slugs array required');

  const placeholders = slugs.map(() => '?').join(',');
  await db.prepare(`DELETE FROM videos WHERE slug IN (${placeholders})`).bind(...slugs).run();

  return ok({ deleted: slugs.length });
}

// ─── Sites CRUD ───────────────────────────────────────────────────────────────
export async function handleSites(request, db) {
  const method = request.method;

  if (method === 'GET') {
    const rows = await db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
    return ok({ sites: rows.results || [] });
  }

  if (method === 'POST') {
    const { url, name } = await request.json();
    if (!url) return error('url required');

    try { new URL(url); } catch (_) { return error('invalid URL'); }

    const nextScan = addHours(new Date(), 24).toISOString();
    await db.prepare(
      `INSERT INTO sites (url, name, next_scan_at) VALUES (?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET name=excluded.name`
    ).bind(url, name || new URL(url).hostname, nextScan).run();

    return ok({});
  }

  return error('Method not allowed', 405);
}

export async function handleSite(request, db, id) {
  const method = request.method;

  if (method === 'PUT') {
    const body = await request.json();
    const { status } = body;
    if (status && !['active', 'paused', 'error'].includes(status)) {
      return error('invalid status');
    }
    await db.prepare('UPDATE sites SET status=? WHERE id=?').bind(status, id).run();
    return ok({});
  }

  if (method === 'DELETE') {
    await db.prepare('DELETE FROM sites WHERE id=?').bind(id).run();
    return ok({});
  }

  return error('Method not allowed', 405);
}
