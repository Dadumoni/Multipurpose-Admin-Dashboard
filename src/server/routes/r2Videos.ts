import express from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../db.js';

export const r2VideosRouter = express.Router();

const R2_PROJECTION = 'id, slug, title, thumbnail, video_link, zerostorage, abyss, anonmp4, views, created_at, file_size, duration';
const TG_PROJECTION = 'id, title, description, video_url, thumbnail_url, views, file_size, duration, file_id, telegram_file_id, telegram_file_unique_id, zerostorage_file_id, zerostorage_download_url, zerostorage_embed_url, upload_type, source, metadata, created_at';

// ============================================================
// 1. R2 VIDEOS (all_videos_db from Supabase) - Server-Side Pagination & FIFO Queue
// ============================================================
r2VideosRouter.get('/api/r2-videos', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) {
      return res.status(503).json({ error: 'Supabase client not configured' });
    }

    const search = (req.query.search as string || '').trim();
    const sort = (req.query.sort as string) || 'date_desc';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 12));
    const offset = (page - 1) * limit;

    let query = sb.from('all_videos_db').select(R2_PROJECTION, { count: 'exact' });

    if (search) {
      query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    // Auto-Shift / FIFO Queue Ordering
    if (sort === 'date_asc') {
      query = query.order('id', { ascending: true });
    } else if (sort === 'views_desc') {
      query = query.order('views', { ascending: false });
    } else if (sort === 'title_asc') {
      query = query.order('title', { ascending: true });
    } else {
      query = query.order('id', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: videos, count, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    let totalViews = 0;
    const { data: viewsData } = await sb.from('all_videos_db').select('views');
    if (viewsData && Array.isArray(viewsData)) {
      totalViews = viewsData.reduce((acc, row) => acc + (Number(row.views) || 0), 0);
    }

    const totalVideosCount = count !== null ? count : (videos ? videos.length : 0);

    res.json({
      success: true,
      videos: videos || [],
      totalCount: totalVideosCount,
      totalViews,
      page,
      limit,
      totalPages: Math.ceil((totalVideosCount || 0) / limit) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

r2VideosRouter.patch('/api/r2-videos/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase not configured' });
    const { id } = req.params;
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const { data, error } = await sb
      .from('all_videos_db')
      .update({ title: title.trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, video: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helpers to delete files from external video hosting platforms (ZeroStorage & Abyss)
function extractZeroStorageFileId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) return uuidMatch[0];
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length > 0) {
    const last = parts[parts.length - 1].split('?')[0];
    return last || null;
  }
  return null;
}

function extractAbyssSlug(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length > 0) {
    const last = parts[parts.length - 1].split('?')[0];
    return last || null;
  }
  return null;
}

async function deleteFromZeroStorage(zerostorageUrl: string | null | undefined) {
  const fileId = extractZeroStorageFileId(zerostorageUrl);
  if (!fileId) return;
  const apiKey = process.env.ZEROSTORAGE_API_KEY || 'sk_yiuy_dNgUpsKSGWz5YXD-GBZ-w6iuQnA';
  try {
    const res = await fetch(`https://zerostorage.net/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': apiKey,
      },
    });
    console.log(`[ZeroStorage Delete] File ${fileId} deletion HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`[ZeroStorage Delete Error] File ${fileId}:`, err?.message || err);
  }
}

async function deleteFromAbyss(abyssUrl: string | null | undefined) {
  const slug = extractAbyssSlug(abyssUrl);
  if (!slug) return;
  try {
    const res = await fetch(`https://api.hydrax.net/9e805aa56a78e2abd1be605e7af7b3cb/delete/${slug}`);
    const data = await res.json().catch(() => null);
    console.log(`[Abyss Delete] Slug ${slug} deletion:`, data);
  } catch (err: any) {
    console.error(`[Abyss Delete Error] Slug ${slug}:`, err?.message || err);
  }
}

r2VideosRouter.delete('/api/r2-videos/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase not configured' });
    const { id } = req.params;

    const { data: video } = await sb
      .from('all_videos_db')
      .select('id, zerostorage, abyss')
      .eq('id', id)
      .maybeSingle();

    if (video) {
      await Promise.allSettled([
        deleteFromZeroStorage(video.zerostorage),
        deleteFromAbyss(video.abyss),
      ]);
    }

    const { error } = await sb
      .from('all_videos_db')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: `Video #${id} deleted from DB and external platforms` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch delete multiple videos from Supabase, ZeroStorage, and Abyss
r2VideosRouter.post('/api/r2-videos/batch-delete', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase not configured' });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const { data: videos } = await sb
      .from('all_videos_db')
      .select('id, zerostorage, abyss')
      .in('id', ids);

    if (videos && videos.length > 0) {
      const deleteTasks = videos.flatMap((v) => [
        deleteFromZeroStorage(v.zerostorage),
        deleteFromAbyss(v.abyss),
      ]);
      await Promise.allSettled(deleteTasks);
    }

    const { error } = await sb
      .from('all_videos_db')
      .delete()
      .in('id', ids);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, count: ids.length, message: `${ids.length} videos deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. TELEGRAM UPLOADED VIDEOS (telegram_uploaded in Supabase)
// ============================================================
r2VideosRouter.get(['/api/telegram-uploaded', '/api/telegram-bot/uploaded'], async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 12));
    const search = (req.query.search as string || '').trim();
    const sort = (req.query.sort as string) || 'date_desc';

    let query = sb
      .from('telegram_uploaded')
      .select(TG_PROJECTION, { count: 'exact' });

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Auto-Shift / FIFO Queue Ordering
    if (sort === 'date_asc') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'views_desc') {
      query = query.order('views', { ascending: false });
    } else if (sort === 'title_asc') {
      query = query.order('title', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: items, count, error } = await query;
    if (error) throw error;

    const totalCount = count !== null ? count : (items?.length || 0);

    const zeroStorageCount = (items || []).filter(i => Boolean(
      i.zerostorage_download_url || i.zerostorage_file_id || i.zerostorage_embed_url || i.video_url?.includes('zerostorage')
    )).length;

    res.json({
      success: true,
      data: items || [],
      videos: items || [],
      totalCount,
      total: totalCount,
      zeroStorageCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    });
  } catch (error: any) {
    console.error('Failed to query telegram-uploaded videos from Supabase:', error);
    res.status(500).json({ error: error.message || 'Failed to query telegram-uploaded videos' });
  }
});

// Update title for telegram uploaded video
r2VideosRouter.patch(['/api/telegram-uploaded/:id', '/api/telegram-bot/uploaded/:id'], async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const id = req.params.id;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const { data, error } = await sb
      .from('telegram_uploaded')
      .update({ title: title.trim() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, message: 'Video title updated', data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update video' });
  }
});

// Delete single telegram uploaded video
r2VideosRouter.delete(['/api/telegram-uploaded/:id', '/api/telegram-bot/uploaded/:id'], async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const id = req.params.id;

    const { error } = await sb
      .from('telegram_uploaded')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete video' });
  }
});

// Bulk delete telegram uploaded videos
r2VideosRouter.post('/api/telegram-uploaded/bulk-delete', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase client not configured' });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const { error } = await sb
      .from('telegram_uploaded')
      .delete()
      .in('id', ids);

    if (error) throw error;
    res.json({ success: true, count: ids.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to bulk delete videos' });
  }
});
