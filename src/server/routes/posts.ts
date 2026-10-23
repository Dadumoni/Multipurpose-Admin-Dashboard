import express from 'express';
import { getSupabaseClient, getSupabaseDashboardStats } from '../db.js';
import { cacheGet, cacheSet, invalidatePostsCache } from '../cache.js';

export const postsRouter = express.Router();

const POSTS_PROJECTION = 'id, slug, title, 480p_link, 720p_link, thumbnail_url, views, scraped_at, domain, duration, post_url, video_url, is_expired, created_at';

// 1. GET /api/posts - Query Supabase viralhub_db with Server-Side Pagination, Field Projection, and FIFO Queue ordering
postsRouter.get('/api/posts', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) {
      return res.status(503).json({ error: 'Supabase client not configured' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 12));
    const search = (req.query.search as string || '').trim();
    const domainParam = (req.query.domain as string || '').trim();
    const sort = (req.query.sort as string) || 'date_desc';
    const isExpiredOnly = req.query.expired_only === 'true' || req.query.expired === 'true';
    const isMissingThumbs = req.query.missing_thumbnail === 'true' || req.query.missing_thumbs === 'true';

    const cacheKey = `posts:sb:${JSON.stringify({ page, limit, search, domain: domainParam, sort, isExpiredOnly, isMissingThumbs })}`;
    const cachedResult = cacheGet<any>(cacheKey);
    if (cachedResult && req.query.refresh !== 'true') {
      return res.json(cachedResult);
    }

    let query = sb
      .from('viralhub_db')
      .select(POSTS_PROJECTION, { count: 'exact' });

    if (isExpiredOnly) {
      query = query.eq('is_expired', true);
    }

    if (isMissingThumbs) {
      query = query.or('thumbnail_url.is.null,thumbnail_url.eq.,thumbnail_url.eq.null');
    }

    if (domainParam && domainParam !== 'all') {
      const cleanDomain = domainParam.replace(/^www\./, '');
      query = query.or(`domain.ilike.%${cleanDomain}%,post_url.ilike.%${cleanDomain}%`);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%,domain.ilike.%${search}%`);
    }

    // Auto-Shift / FIFO queue ordering
    if (sort === 'date_asc') {
      query = query.order('scraped_at', { ascending: true, nullsFirst: false });
    } else if (sort === 'views_desc') {
      query = query.order('views', { ascending: false });
    } else if (sort === 'views_asc') {
      query = query.order('views', { ascending: true });
    } else if (sort === 'title_asc') {
      query = query.order('title', { ascending: true });
    } else {
      // Default: date_desc (newest first, FIFO order)
      query = query.order('scraped_at', { ascending: false, nullsFirst: false });
    }

    // Exact Server-Side Pagination window (12 rows per page)
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: items, count, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const total = count !== null ? count : (items?.length || 0);

    const responsePayload = {
      success: true,
      data: items || [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };

    cacheSet(cacheKey, responsePayload, 60);
    res.json(responsePayload);
  } catch (error: any) {
    console.error('Failed to query Supabase viralhub_db posts:', error);
    res.status(500).json({ error: error.message || 'Failed to query posts' });
  }
});

// 2. GET /api/posts/duplicates - Detect duplicate videos by title/slug
postsRouter.get('/api/posts/duplicates', async (_req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });

    // Fast check on recent records
    const { data: recent, error } = await sb
      .from('viralhub_db')
      .select('id, title, slug, thumbnail_url, views, scraped_at, domain')
      .order('scraped_at', { ascending: false, nullsFirst: false })
      .limit(1000);

    if (error) throw error;

    const pairs: any[] = [];
    if (recent && recent.length > 0) {
      const titleMap = new Map<string, any>();
      for (const item of recent) {
        if (!item.title) continue;
        const norm = item.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm.length > 15) {
          if (titleMap.has(norm)) {
            const original = titleMap.get(norm);
            pairs.push({
              key: norm,
              field: 'title',
              original,
              duplicate: item,
            });
          } else {
            titleMap.set(norm, item);
          }
        }
      }
    }

    res.json({
      success: true,
      duplicateCount: pairs.length,
      pairs: pairs.slice(0, 50),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/posts/:id - Query single post from viralhub_db
postsRouter.get('/api/posts/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const { id } = req.params;

    const { data, error } = await sb
      .from('viralhub_db')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Post not found' });

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. PATCH /api/posts/:id - Update post title/details in Supabase
postsRouter.patch('/api/posts/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const { id } = req.params;

    const allowedUpdates: Record<string, any> = {};
    if (req.body.title !== undefined) allowedUpdates.title = String(req.body.title).trim();
    if (req.body.thumbnail_url !== undefined) allowedUpdates.thumbnail_url = req.body.thumbnail_url;
    if (req.body.video_url !== undefined) allowedUpdates.video_url = req.body.video_url;
    if (req.body['720p_link'] !== undefined) allowedUpdates['720p_link'] = req.body['720p_link'];
    if (req.body['480p_link'] !== undefined) allowedUpdates['480p_link'] = req.body['480p_link'];
    if (req.body.is_expired !== undefined) allowedUpdates.is_expired = Boolean(req.body.is_expired);

    const { data, error } = await sb
      .from('viralhub_db')
      .update(allowedUpdates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    invalidatePostsCache();

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. DELETE /api/posts/:id - Delete post from Supabase
postsRouter.delete('/api/posts/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const { id } = req.params;

    const { error } = await sb
      .from('viralhub_db')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    invalidatePostsCache();

    res.json({ success: true, message: `Post #${id} deleted from viralhub_db` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. POST /api/posts/bulk-delete - Delete multiple posts from Supabase in single query
postsRouter.post('/api/posts/bulk-delete', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    const { error } = await sb
      .from('viralhub_db')
      .delete()
      .in('id', ids);

    if (error) return res.status(500).json({ error: error.message });
    invalidatePostsCache();

    res.json({ success: true, count: ids.length, message: `${ids.length} posts deleted from viralhub_db` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
