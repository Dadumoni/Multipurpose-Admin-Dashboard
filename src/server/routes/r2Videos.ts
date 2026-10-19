import express from 'express';
import crypto from 'crypto';
import {
  connectToDatabase,
  UploadedVideoModel,
  TrackedFileModel,
  PostModel,
  getSupabaseClient,
  adjustMongoTotalVideos,
} from '../db.js';
import { syncPostMutation } from '../sync.js';

export const r2VideosRouter = express.Router();

// ============================================================
// R2 VIDEOS (all_videos_db from Supabase)
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
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 24));
    const offset = (page - 1) * limit;

    let query = sb.from('all_videos_db').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
    }

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
      totalPages: Math.ceil((count || 0) / limit),
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

r2VideosRouter.delete('/api/r2-videos/:id', async (req, res) => {
  try {
    const sb = getSupabaseClient();
    if (!sb) return res.status(503).json({ error: 'Supabase not configured' });
    const { id } = req.params;

    const { error } = await sb
      .from('all_videos_db')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: `Video #${id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/uploaded-videos - List uploaded videos from MongoDB
r2VideosRouter.get('/api/uploaded-videos', async (_req, res) => {
  try {
    await connectToDatabase();
    const items = await UploadedVideoModel.find().sort({ created_at: -1 }).lean();
    res.json({ data: items });
  } catch (error: any) {
    console.error('Failed to query uploaded videos from MongoDB:', error);
    res.status(500).json({ error: error.message || 'Failed to query uploaded videos' });
  }
});

// 6. POST /api/uploaded-videos - Create uploaded video in MongoDB
r2VideosRouter.post('/api/uploaded-videos', async (req, res) => {
  try {
    await connectToDatabase();
    const { title, description, video_url, thumbnail_url, file_size, duration, upload_type } = req.body;

    if (!title || !video_url) {
      return res.status(400).json({ error: 'Title and video_url are required' });
    }

    const id = crypto.randomUUID();
    const newVideo = await UploadedVideoModel.create({
      id,
      title,
      description: description || null,
      video_url,
      thumbnail_url: thumbnail_url || null,
      file_size: file_size || '42.0 MB',
      duration: duration || '03:15',
      upload_type: upload_type || 'upload',
      views: 0,
      created_at: new Date(),
    });

    // Also upsert into MongoDB 'post' collection so all videos stay accessible
    await PostModel.updateOne(
      { video_url },
      {
        $set: {
          title,
          video_url,
          thumbnail_url: thumbnail_url || null,
          created_at: new Date(),
          views: 0,
          synced_at: new Date(),
        },
      },
      { upsert: true }
    );
    await adjustMongoTotalVideos(1);

    try {
      const fileHash = crypto.createHash('sha256').update(video_url).digest('hex');
      await TrackedFileModel.updateOne(
        { file_hash: fileHash },
        {
          $set: {
            id,
            file_hash: fileHash,
            file_name: title,
            file_size: file_size || null,
            mime_type: 'video/mp4',
            source: 'dashboard',
            zerostorage_download_url: video_url,
            title,
            thumbnail_url: thumbnail_url || null,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (trackErr) {
      console.warn('Tracked file save notice:', trackErr);
    }

    syncPostMutation({ action: 'add', post: { title, video_url, thumbnail_url: thumbnail_url || null } }).catch(err => {
      console.warn('Background Supabase sync error:', err?.message || err);
    });

    res.status(201).json({ success: true, data: newVideo });
  } catch (error: any) {
    console.error('Failed to create uploaded video in MongoDB:', error);
    res.status(500).json({ error: error.message || 'Failed to create uploaded video' });
  }
});

// 7. DELETE /api/uploaded-videos/:id - Delete uploaded video from MongoDB
r2VideosRouter.delete('/api/uploaded-videos/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const id = req.params.id;
    const existing = await UploadedVideoModel.findOne({ id });

    if (!existing) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await UploadedVideoModel.deleteOne({ id });
    if (existing.video_url) {
      await PostModel.deleteOne({ video_url: existing.video_url });
      await adjustMongoTotalVideos(-1);
      syncPostMutation({ action: 'delete', video_url: existing.video_url }).catch(err => {
        console.warn('Background Supabase delete sync error:', err?.message || err);
      });
    }

    res.json({ success: true, message: 'Uploaded video deleted from MongoDB' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete uploaded video' });
  }
});

// 8. POST /api/uploaded-videos/bulk-delete - Bulk delete uploaded videos
r2VideosRouter.post('/api/uploaded-videos/bulk-delete', async (req, res) => {
  try {
    await connectToDatabase();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const toDelete = await UploadedVideoModel.find({ id: { $in: ids } }).lean();
    await UploadedVideoModel.deleteMany({ id: { $in: ids } });

    const urls = toDelete.map(v => v.video_url).filter(Boolean);
    if (urls.length > 0) {
      await PostModel.deleteMany({ video_url: { $in: urls } });
      await adjustMongoTotalVideos(-urls.length);
      syncPostMutation({ action: 'delete', video_urls: urls }).catch(err => {
        console.warn('Background Supabase bulk delete sync error:', err?.message || err);
      });
    }

    res.json({ success: true, count: toDelete.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to bulk delete uploaded videos' });
  }
});

// 8b. GET /api/telegram-uploaded - Query all Telegram to ZeroStorage / MongoDB uploaded videos
r2VideosRouter.get('/api/telegram-uploaded', async (_req, res) => {
  try {
    await connectToDatabase();
    const [trackedFiles, uploadedVideos] = await Promise.all([
      TrackedFileModel.find().sort({ created_at: -1 }).lean(),
      UploadedVideoModel.find().sort({ created_at: -1 }).lean(),
    ]);

    const itemMap = new Map<string, any>();

    for (const tf of trackedFiles) {
      const key = String(tf.id || tf._id || tf.file_hash);
      itemMap.set(key, {
        id: String(tf.id || tf._id),
        title: tf.title || tf.file_name || 'Untitled Video',
        file_name: tf.file_name || tf.title || 'video.mp4',
        file_size: tf.file_size || 'Video File',
        mime_type: tf.mime_type || 'video/mp4',
        source: tf.source || 'telegram',
        telegram_file_id: tf.telegram_file_id || null,
        telegram_file_unique_id: tf.telegram_file_unique_id || null,
        zerostorage_file_id: tf.zerostorage_file_id || null,
        zerostorage_download_url: tf.zerostorage_download_url || null,
        zerostorage_embed_url: tf.zerostorage_embed_url || null,
        video_url: tf.zerostorage_download_url || tf.zerostorage_embed_url || '',
        thumbnail_url: tf.thumbnail_url || null,
        created_at: tf.created_at || new Date().toISOString(),
      });
    }

    for (const uv of uploadedVideos) {
      const key = String(uv.id || uv._id);
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          id: String(uv.id || uv._id),
          title: uv.title || 'Untitled Video',
          file_name: uv.title || 'video.mp4',
          file_size: uv.file_size || 'Video File',
          mime_type: 'video/mp4',
          source: uv.source || 'telegram',
          telegram_file_id: uv.file_id || null,
          telegram_file_unique_id: null,
          zerostorage_file_id: null,
          zerostorage_download_url: uv.video_url?.includes('zerostorage') ? uv.video_url : null,
          zerostorage_embed_url: null,
          video_url: uv.video_url || '',
          thumbnail_url: uv.thumbnail_url || null,
          created_at: uv.created_at || new Date().toISOString(),
        });
      }
    }

    const items = Array.from(itemMap.values()).sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const zeroStorageCount = items.filter(i => Boolean(
      i.zerostorage_download_url || i.zerostorage_file_id || i.zerostorage_embed_url || i.video_url?.includes('zerostorage')
    )).length;

    res.json({
      data: items,
      totalCount: items.length,
      zeroStorageCount,
    });
  } catch (error: any) {
    console.error('Failed to query telegram-uploaded videos:', error);
    res.status(500).json({ error: error.message || 'Failed to query telegram-uploaded videos' });
  }
});

// 8c. PATCH /api/telegram-uploaded/:id - Update video title/details
r2VideosRouter.patch('/api/telegram-uploaded/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const id = req.params.id;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    await Promise.all([
      TrackedFileModel.updateOne({ id }, { $set: { title, file_name: title } }),
      UploadedVideoModel.updateOne({ id }, { $set: { title } }),
    ]);

    res.json({ success: true, message: 'Video title updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update video' });
  }
});

// 8d. DELETE /api/telegram-uploaded/:id - Delete video from MongoDB
r2VideosRouter.delete('/api/telegram-uploaded/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const id = req.params.id;
    await Promise.all([
      TrackedFileModel.deleteOne({ id }),
      UploadedVideoModel.deleteOne({ id }),
    ]);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete video' });
  }
});

// 8e. POST /api/telegram-uploaded/bulk-delete - Bulk delete videos from MongoDB
r2VideosRouter.post('/api/telegram-uploaded/bulk-delete', async (req, res) => {
  try {
    await connectToDatabase();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    await Promise.all([
      TrackedFileModel.deleteMany({ id: { $in: ids } }),
      UploadedVideoModel.deleteMany({ id: { $in: ids } }),
    ]);

    res.json({ success: true, count: ids.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to bulk delete videos' });
  }
});
