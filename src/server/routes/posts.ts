import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import http from 'http';
import https from 'https';
import {
  connectToDatabase,
  PostModel,
  getSupabaseClient,
  getSupabaseDashboardStats,
  adjustMongoTotalVideos,
} from '../db.js';
import { syncPostMutation } from '../sync.js';
import { scheduleDebouncedRecalculate } from '../statsManager.js';
import { cacheGet, cacheSet, invalidatePostsCache } from '../cache.js';

export const postsRouter = express.Router();

// 1. GET /api/posts - Query MongoDB post collection
postsRouter.get('/api/posts', async (req, res) => {
  try {
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({ error: 'MONGODB_URI not configured' });
    }

    await connectToDatabase();

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const isAll = req.query.limit === 'all';
    const limit = isAll ? 50000 : Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 100));
    const search = (req.query.search as string || '').trim();
    const domainParam = (req.query.domain as string || '').trim();
    const sort = (req.query.sort as string) || 'date_desc';

    const andConditions: any[] = [];
    if (req.query.expired_only === 'true' || req.query.expired === 'true') {
      andConditions.push({ is_expired: true });
    }
    if (req.query.missing_thumbnail === 'true' || req.query.missing_thumbs === 'true') {
      andConditions.push({
        $or: [
          { thumbnail_url: null },
          { thumbnail_url: '' },
          { thumbnail_url: 'null' },
          { thumbnail_url: { $exists: false } },
        ],
      });
    }
    if (domainParam && domainParam !== 'all') {
      const cleanDomain = domainParam.replace(/^www\./, '');
      andConditions.push({
        $or: [
          { domain: { $regex: cleanDomain, $options: 'i' } },
          { post_url: { $regex: cleanDomain, $options: 'i' } },
        ],
      });
    }
    if (search) {
      andConditions.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { video_url: { $regex: search, $options: 'i' } },
          { post_url: { $regex: search, $options: 'i' } },
          { video_id: { $regex: search, $options: 'i' } },
          { domain: { $regex: search, $options: 'i' } },
          { '720p_link': { $regex: search, $options: 'i' } },
          { '480p_link': { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter: any = andConditions.length > 1 ? { $and: andConditions } : (andConditions.length === 1 ? andConditions[0] : {});

    let sortOptions: any = { _id: -1 };
    if (sort === 'date_asc') sortOptions = { _id: 1 };
    if (sort === 'views_desc') sortOptions = { views: -1, _id: -1 };
    if (sort === 'views_asc') sortOptions = { views: 1, _id: 1 };
    if (sort === 'title_asc') sortOptions = { title: 1, _id: -1 };

    const cacheKey = `posts:list:${JSON.stringify({ page, limit, isAll, search, domain: domainParam, sort, expired_only: req.query.expired_only || req.query.expired })}`;
    const cachedResult = cacheGet<any>(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const query = PostModel.find(filter).sort(sortOptions);
    query.setOptions({ allowDiskUse: true });
    if (!isAll) {
      query.skip((page - 1) * limit).limit(limit);
    }

    const [items, total] = await Promise.all([
      query.lean(),
      PostModel.countDocuments(filter),
    ]);

    const responsePayload = {
      data: items,
      total,
      page,
      limit,
      totalPages: isAll ? 1 : Math.ceil(total / limit),
    };
    cacheSet(cacheKey, responsePayload, 60);

    res.json(responsePayload);
  } catch (error: any) {
    console.error('Failed to query MongoDB posts:', error);
    res.status(500).json({ error: error.message || 'Failed to query MongoDB posts' });
  }
});

// 1b. GET /api/posts/duplicates - Aggregation to detect duplicate video links in MongoDB
postsRouter.get('/api/posts/duplicates', async (_req, res) => {
  try {
    await connectToDatabase();
    const dupAgg = await PostModel.aggregate([
      {
        $match: {
          video_url: { $type: 'string', $gt: 'http' },
        },
      },
      {
        $group: {
          _id: '$video_url',
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: '$_id',
              id: '$id',
              title: '$title',
              video_url: '$video_url',
              thumbnail_url: '$thumbnail_url',
              created_at: '$created_at',
              scraped_at: '$scraped_at',
              views: '$views',
              domain: '$domain',
              duration: '$duration',
              '720p_link': '$720p_link',
              '480p_link': '$480p_link',
              is_expired: '$is_expired',
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 },
    ]);

    const pairs: any[] = [];
    dupAgg.forEach(group => {
      const docs = group.docs;
      if (docs && docs.length >= 2) {
        const original = docs[0];
        for (let i = 1; i < docs.length; i++) {
          const duplicate = docs[i];
          pairs.push({
            id: `${original.id || original._id}-${duplicate.id || duplicate._id}`,
            original,
            duplicate,
            reason: 'Duplicate Stream Link',
            detail: group._id,
          });
        }
      }
    });

    res.json({ success: true, pairs });
  } catch (error: any) {
    console.error('Failed to detect duplicates in MongoDB:', error);
    res.status(500).json({ error: error.message || 'Failed to detect duplicates' });
  }
});

// 1c. GET /api/posts/:id - Fetch individual post details from MongoDB
postsRouter.get('/api/posts/:id', async (req, res) => {
  try {
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({ error: 'MONGODB_URI not configured' });
    }
    await connectToDatabase();
    const idParam = req.params.id;
    const numId = Number(idParam);
    const isValidMongoId = mongoose.isValidObjectId(idParam);

    const filter = !isNaN(numId)
      ? (isValidMongoId ? { $or: [{ id: numId }, { _id: idParam }, { video_id: String(idParam) }] } : { $or: [{ id: numId }, { video_id: String(idParam) }] })
      : (isValidMongoId ? { $or: [{ _id: idParam }, { video_id: String(idParam) }, { video_url: idParam }] } : { $or: [{ video_id: String(idParam) }, { video_url: idParam }] });

    const post = await PostModel.findOne(filter).lean();
    if (!post) {
      return res.status(404).json({ error: 'Post not found in MongoDB' });
    }

    res.json({ success: true, data: post });
  } catch (error: any) {
    console.error('Failed to query single post from MongoDB:', error);
    res.status(500).json({ error: error.message || 'Failed to query post' });
  }
});

// 1d. POST /api/posts - Create post in MongoDB and mirror to Supabase
postsRouter.post('/api/posts', async (req, res) => {
  try {
    await connectToDatabase();
    const { 
      title, 
      video_url, 
      thumbnail_url, 
      views, 
      duration,
      post_url,
      video_id,
      scraped_at,
      domain,
      all_links,
    } = req.body;

    const direct480p = req.body['480p_link'] || req.body['video_url1'] || null;
    const direct720p = req.body['720p_link'] || req.body['video_url2'] || null;
    const effectiveVideoUrl = video_url || direct720p || direct480p;

    if (!effectiveVideoUrl) {
      return res.status(400).json({ error: 'video_url or streaming link is required' });
    }

    const id = Date.now();
    const newPost = await PostModel.create({
      id,
      title: title || 'Untitled Video',
      video_url: effectiveVideoUrl,
      thumbnail_url: thumbnail_url || null,
      views: Number(views) || 0,
      duration: duration || null,
      post_url: post_url || null,
      video_id: video_id || null,
      scraped_at: scraped_at || Date.now() / 1000,
      updated_at: Date.now(),
      '480p_link': direct480p,
      '720p_link': direct720p,
      all_links: Array.isArray(all_links) ? all_links : [direct480p, direct720p].filter(Boolean),
      domain: domain || (post_url ? new URL(post_url).hostname : null),
      created_at: new Date(),
      synced_at: new Date(),
    });

    await adjustMongoTotalVideos(1);
    invalidatePostsCache();

    syncPostMutation({ action: 'add', post: newPost }).catch(err => {
      console.warn('Background Supabase add sync error:', err?.message || err);
    });

    res.status(201).json({ success: true, data: newPost });
  } catch (error: any) {
    console.error('Failed to create post in MongoDB:', error);
    res.status(500).json({ error: error.message || 'Failed to create post' });
  }
});

// 2. DELETE /api/posts/:id - Delete single post from MongoDB and Supabase
postsRouter.delete('/api/posts/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const idParam = req.params.id;
    const numId = Number(idParam);

    const isValidMongoId = mongoose.isValidObjectId(idParam);
    const filter = !isNaN(numId)
      ? (isValidMongoId ? { $or: [{ id: numId }, { _id: idParam }, { video_id: String(idParam) }] } : { $or: [{ id: numId }, { video_id: String(idParam) }] })
      : (isValidMongoId ? { $or: [{ _id: idParam }, { video_id: String(idParam) }] } : { $or: [{ video_id: String(idParam) }, { video_url: idParam }, { '720p_link': idParam }, { '480p_link': idParam }] });
    const existing = await PostModel.findOne(filter);

    if (!existing) {
      return res.status(404).json({ error: 'Post not found in MongoDB' });
    }

    await PostModel.deleteOne({ _id: existing._id });
    await adjustMongoTotalVideos(-1);
    invalidatePostsCache();
    scheduleDebouncedRecalculate(1000);

    await syncPostMutation({ action: 'delete', post: existing, id: idParam });

    res.json({ success: true, message: `Post #${idParam} deleted from MongoDB and Supabase` });
  } catch (error: any) {
    console.error('Failed to delete post:', error);
    res.status(500).json({ error: error.message || 'Failed to delete post' });
  }
});

// 3. POST /api/posts/bulk-delete - Delete multiple posts from both MongoDB and Supabase
postsRouter.post('/api/posts/bulk-delete', async (req, res) => {
  try {
    await connectToDatabase();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const numIds = ids.map(id => Number(id)).filter(n => !isNaN(n));
    const strIds = ids.map(id => String(id));
    const validMongoIds = strIds.filter(id => mongoose.isValidObjectId(id));

    const orConditions: any[] = [{ video_id: { $in: strIds } }];
    if (numIds.length > 0) orConditions.push({ id: { $in: numIds } });
    if (validMongoIds.length > 0) orConditions.push({ _id: { $in: validMongoIds } });

    const postsToDelete = await PostModel.find({
      $or: orConditions,
    }, { video_url: 1, post_url: 1, id: 1, _id: 1, video_id: 1, '720p_link': 1, '480p_link': 1 }).lean();

    await PostModel.deleteMany({
      $or: orConditions,
    });
    await adjustMongoTotalVideos(-postsToDelete.length);
    invalidatePostsCache();
    scheduleDebouncedRecalculate(1000);

    await syncPostMutation({ action: 'delete', posts: postsToDelete, ids: strIds });

    res.json({ success: true, count: postsToDelete.length });
  } catch (error: any) {
    console.error('Failed to bulk delete posts:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk delete posts' });
  }
});

// 4. PATCH /api/posts/:id - Update post metadata in MongoDB
postsRouter.patch('/api/posts/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const idParam = req.params.id;
    const numId = Number(idParam);
    const { 
      title, 
      video_url, 
      thumbnail_url,
      post_url,
      video_id,
      domain,
      duration,
      views,
      all_links,
    } = req.body;

    const updateData: any = { updated_at: Date.now() };
    if (title !== undefined) updateData.title = title;
    if (video_url !== undefined) updateData.video_url = video_url;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
    if (post_url !== undefined) updateData.post_url = post_url;
    if (video_id !== undefined) updateData.video_id = video_id;
    if (domain !== undefined) updateData.domain = domain;
    if (duration !== undefined) updateData.duration = duration;
    if (views !== undefined) updateData.views = Number(views);
    if (req.body['480p_link'] !== undefined) updateData['480p_link'] = req.body['480p_link'];
    if (req.body['720p_link'] !== undefined) updateData['720p_link'] = req.body['720p_link'];
    if (all_links !== undefined) updateData.all_links = all_links;

    const isValidMongoId = mongoose.isValidObjectId(idParam);
    const filter = !isNaN(numId)
      ? (isValidMongoId ? { $or: [{ id: numId }, { _id: idParam }, { video_id: String(idParam) }] } : { $or: [{ id: numId }, { video_id: String(idParam) }] })
      : (isValidMongoId ? { $or: [{ _id: idParam }, { video_id: String(idParam) }] } : { $or: [{ video_id: String(idParam) }, { video_url: idParam }] });
    const updated = await PostModel.findOneAndUpdate(filter, { $set: updateData }, { returnDocument: 'after' });

    if (!updated) {
      return res.status(404).json({ error: 'Post not found' });
    }

    invalidatePostsCache();
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Failed to update post:', error);
    res.status(500).json({ error: error.message || 'Failed to update post' });
  }
});

// Check-Expired Engine and Routes
const httpCheckAgent = new http.Agent({ keepAlive: true, maxSockets: 80 });
const httpsCheckAgent = new https.Agent({ keepAlive: true, maxSockets: 80 });

interface CheckExpiredState {
  checking: boolean;
  total: number;
  checked: number;
  expiredCount: number;
  activeCount?: number;
  recoveredCount?: number;
  newlyExpiredCount?: number;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  startedAt: Date | null;
  completedAt: Date | null;
  cancelRequested?: boolean;
  message?: string;
}

let checkExpiredState: CheckExpiredState = {
  checking: false,
  total: 0,
  checked: 0,
  expiredCount: 0,
  activeCount: 0,
  recoveredCount: 0,
  newlyExpiredCount: 0,
  status: 'idle',
  startedAt: null,
  completedAt: null,
  message: '',
};

let checkExpiredAbortController: AbortController | null = null;
const sseClients = new Set<express.Response>();

function broadcastCheckExpiredState() {
  const payload = `data: ${JSON.stringify(checkExpiredState)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function checkSingleUrl(url: string, signal?: AbortSignal): Promise<boolean> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  if (signal?.aborted) return false;
  try {
    const res = await axios.get(url, {
      timeout: 4000,
      signal,
      headers: {
        'Referer': '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-1024',
        'Accept': '*/*',
      },
      validateStatus: () => true,
      responseType: 'stream',
      httpAgent: httpCheckAgent,
      httpsAgent: httpsCheckAgent,
    });
    if (res.data && typeof res.data.destroy === 'function') {
      res.data.destroy();
    }
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function checkPostLinks(p: any, signal?: AbortSignal): Promise<boolean> {
  const candidateUrls: string[] = [];
  if (p['720p_link'] && typeof p['720p_link'] === 'string' && p['720p_link'].startsWith('http')) {
    candidateUrls.push(p['720p_link']);
  }
  if (p['480p_link'] && typeof p['480p_link'] === 'string' && p['480p_link'].startsWith('http')) {
    if (!candidateUrls.includes(p['480p_link'])) candidateUrls.push(p['480p_link']);
  }
  if (p.video_url && typeof p.video_url === 'string' && p.video_url.startsWith('http')) {
    if (!candidateUrls.includes(p.video_url)) candidateUrls.push(p.video_url);
  }
  if (Array.isArray(p.all_links)) {
    for (const l of p.all_links) {
      if (l && typeof l === 'string' && l.startsWith('http') && !candidateUrls.includes(l)) {
        candidateUrls.push(l);
      }
    }
  }

  if (candidateUrls.length === 0) return false;

  for (const u of candidateUrls) {
    if (signal?.aborted) return false;
    const ok = await checkSingleUrl(u, signal);
    if (ok) return true;
  }
  return false;
}

async function startCheckExpired() {
  if (checkExpiredState.checking) return;
  try {
    await connectToDatabase();
    const allPosts = await PostModel.find({}, { _id: 1, id: 1, video_id: 1, video_url: 1, '720p_link': 1, '480p_link': 1, all_links: 1, is_expired: 1 }).lean();

    checkExpiredAbortController = new AbortController();
    const signal = checkExpiredAbortController.signal;

    const initialExpired = await PostModel.countDocuments({ is_expired: true });
    checkExpiredState = {
      checking: true,
      total: allPosts.length,
      checked: 0,
      expiredCount: initialExpired,
      activeCount: 0,
      recoveredCount: 0,
      newlyExpiredCount: 0,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      cancelRequested: false,
      message: 'Scanning all video links in background (720p & 480p with no-referrer)...',
    };
    broadcastCheckExpiredState();

    const batchSize = 25;
    for (let i = 0; i < allPosts.length; i += batchSize) {
      if (signal.aborted || checkExpiredState.cancelRequested) {
        break;
      }

      const batch = allPosts.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (p: any) => {
          if (signal.aborted) return { _id: p._id, id: p.id, ok: false, wasExpired: Boolean(p.is_expired) };
          const ok = await checkPostLinks(p, signal);
          return { _id: p._id, id: p.id, ok, wasExpired: Boolean(p.is_expired) };
        })
      );

      if (signal.aborted || checkExpiredState.cancelRequested) {
        break;
      }

      const expiredBatchIds = results.filter(r => !r.ok).map(r => r._id);
      const activeBatchIds = results.filter(r => r.ok).map(r => r._id);

      const newlyExpired = results.filter(r => !r.ok && !r.wasExpired).length;
      const recovered = results.filter(r => r.ok && r.wasExpired).length;

      checkExpiredState.recoveredCount = (checkExpiredState.recoveredCount || 0) + recovered;
      checkExpiredState.newlyExpiredCount = (checkExpiredState.newlyExpiredCount || 0) + newlyExpired;

      if (activeBatchIds.length > 0) {
        await PostModel.updateMany(
          { _id: { $in: activeBatchIds } },
          { $set: { is_expired: false, expired_checked_at: new Date() } }
        );
      }

      if (expiredBatchIds.length > 0) {
        await PostModel.updateMany(
          { _id: { $in: expiredBatchIds } },
          { $set: { is_expired: true, expired_checked_at: new Date() } }
        );
      }

      checkExpiredState.checked += batch.length;
      checkExpiredState.activeCount = (checkExpiredState.activeCount || 0) + activeBatchIds.length;
      checkExpiredState.expiredCount = await PostModel.countDocuments({ is_expired: true });
      broadcastCheckExpiredState();
    }

    const wasCancelled = signal.aborted || checkExpiredState.cancelRequested;
    checkExpiredState.checking = false;
    checkExpiredState.completedAt = new Date();
    checkExpiredState.status = wasCancelled ? 'cancelled' : 'completed';
    checkExpiredState.message = wasCancelled
      ? 'Scan cancelled by user'
      : `Check complete: ${checkExpiredState.checked}/${checkExpiredState.total} checked. ${checkExpiredState.recoveredCount || 0} active links restored, ${checkExpiredState.expiredCount} expired.`;
    checkExpiredAbortController = null;
    invalidatePostsCache();
    broadcastCheckExpiredState();
  } catch (err: any) {
    console.error('Error during checkExpired persistent worker:', err);
    checkExpiredState.checking = false;
    checkExpiredState.completedAt = new Date();
    checkExpiredState.status = 'error';
    checkExpiredState.message = err?.message || 'Error occurred during link checking';
    checkExpiredAbortController = null;
    invalidatePostsCache();
    broadcastCheckExpiredState();
  }
}

// 5. GET /api/posts/expired/count
postsRouter.get('/api/posts/expired/count', async (_req, res) => {
  try {
    const cached = cacheGet<number>('expired:count');
    if (typeof cached === 'number') {
      return res.json({ count: cached });
    }

    await connectToDatabase();
    const count = await PostModel.countDocuments({ is_expired: true });
    cacheSet('expired:count', count, 30);
    res.json({ count });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get expired count' });
  }
});

// 6. GET /api/posts/check-expired/events
postsRouter.get('/api/posts/check-expired/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify(checkExpiredState)}\n\n`);
  sseClients.add(res);

  _req.on('close', () => {
    sseClients.delete(res);
  });
});

// 7. GET /api/posts/check-expired/status
postsRouter.get('/api/posts/check-expired/status', async (_req, res) => {
  try {
    await connectToDatabase();
    const dbExpiredCount = await PostModel.countDocuments({ is_expired: true });
    res.json({
      checking: checkExpiredState.checking,
      total: checkExpiredState.total,
      checked: checkExpiredState.checked,
      expiredCount: dbExpiredCount,
      activeCount: checkExpiredState.activeCount || 0,
      recoveredCount: checkExpiredState.recoveredCount || 0,
      newlyExpiredCount: checkExpiredState.newlyExpiredCount || 0,
      status: checkExpiredState.status,
      startedAt: checkExpiredState.startedAt,
      completedAt: checkExpiredState.completedAt,
      message: checkExpiredState.message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get check-expired status' });
  }
});

// 8. POST /api/posts/check-expired
postsRouter.post('/api/posts/check-expired', async (_req, res) => {
  try {
    await connectToDatabase();
    if (checkExpiredState.checking) {
      return res.json({ status: 'already_running', progress: checkExpiredState });
    }

    startCheckExpired();
    res.json({ status: 'started', progress: checkExpiredState });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to start check-expired' });
  }
});

// 9. POST /api/posts/check-expired/stop
postsRouter.post('/api/posts/check-expired/stop', async (_req, res) => {
  checkExpiredState.cancelRequested = true;
  if (checkExpiredAbortController) {
    checkExpiredAbortController.abort();
    checkExpiredAbortController = null;
  }
  checkExpiredState.checking = false;
  checkExpiredState.status = 'cancelled';
  checkExpiredState.completedAt = new Date();
  checkExpiredState.message = 'Scan cancelled by user';
  invalidatePostsCache();
  broadcastCheckExpiredState();
  res.json({ status: 'cancelled', progress: checkExpiredState });
});

// 10. POST /api/posts/mark-expired
postsRouter.post('/api/posts/mark-expired', async (req, res) => {
  try {
    await connectToDatabase();
    const { expiredIds = [], validIds = [] } = req.body;

    if (Array.isArray(expiredIds) && expiredIds.length > 0) {
      const numIds = expiredIds.map((id: any) => Number(id)).filter((n: number) => !isNaN(n));
      const strIds = expiredIds.map((id: any) => String(id));
      const validMongoIds = strIds.filter((id: string) => mongoose.isValidObjectId(id));
      const orConds: any[] = [{ video_id: { $in: strIds } }, { video_url: { $in: strIds } }, { '720p_link': { $in: strIds } }, { '480p_link': { $in: strIds } }];
      if (numIds.length > 0) orConds.push({ id: { $in: numIds } });
      if (validMongoIds.length > 0) orConds.push({ _id: { $in: validMongoIds } });
      await PostModel.updateMany(
        { $or: orConds },
        { $set: { is_expired: true, expired_checked_at: new Date() } }
      );
    }

    if (Array.isArray(validIds) && validIds.length > 0) {
      const numIds = validIds.map((id: any) => Number(id)).filter((n: number) => !isNaN(n));
      const strIds = validIds.map((id: any) => String(id));
      const validMongoIds = strIds.filter((id: string) => mongoose.isValidObjectId(id));
      const orConds: any[] = [{ video_id: { $in: strIds } }, { video_url: { $in: strIds } }, { '720p_link': { $in: strIds } }, { '480p_link': { $in: strIds } }];
      if (numIds.length > 0) orConds.push({ id: { $in: numIds } });
      if (validMongoIds.length > 0) orConds.push({ _id: { $in: validMongoIds } });
      await PostModel.updateMany(
        { $or: orConds },
        { $set: { is_expired: false, expired_checked_at: new Date() } }
      );
    }

    invalidatePostsCache();
    const totalExpired = await PostModel.countDocuments({ is_expired: true });
    res.json({ success: true, expiredCount: totalExpired });
  } catch (error: any) {
    console.error('Failed to update expired status:', error);
    res.status(500).json({ error: error.message || 'Failed to update expired status' });
  }
});

// 11. GET /api/posts/check-list
postsRouter.get('/api/posts/check-list', async (req, res) => {
  try {
    await connectToDatabase();
    const limit = Math.min(10000, parseInt(req.query.limit as string) || 3000);
    const query: any = {};
    if (req.query.domain && req.query.domain !== 'all') {
      const cleanDomain = (req.query.domain as string).replace(/^www\./, '');
      query.$or = [
        { domain: { $regex: cleanDomain, $options: 'i' } },
        { post_url: { $regex: cleanDomain, $options: 'i' } },
      ];
    }
    const posts = await PostModel.find(query, {
      _id: 1,
      id: 1,
      video_id: 1,
      '720p_link': 1,
      '480p_link': 1,
      video_url: 1,
      all_links: 1,
      is_expired: 1,
    }).limit(limit).lean();

    res.json({
      success: true,
      total: posts.length,
      posts: posts.map((p: any) => ({
        _id: String(p._id),
        id: p.id !== undefined && p.id !== null ? p.id : (p.video_id || String(p._id)),
        link_720p: p['720p_link'] || null,
        link_480p: p['480p_link'] || null,
        video_url: p.video_url || null,
        all_links: Array.isArray(p.all_links) ? p.all_links : [],
        is_expired: Boolean(p.is_expired),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch check list' });
  }
});

// 12. GET /api/posts/missing-thumbnails/count - Fast O(1) from Supabase dashboard_stats
postsRouter.get('/api/posts/missing-thumbnails/count', async (_req, res) => {
  try {
    // 1. Try instant O(1) read from Supabase dashboard_stats table
    const stats = await getSupabaseDashboardStats();
    if (stats && typeof stats.missing_thumbnail === 'number') {
      return res.json({ count: stats.missing_thumbnail });
    }

    // 2. Direct Supabase head count fallback
    const sb = getSupabaseClient();
    if (sb) {
      try {
        const { count, error } = await sb
          .from('viralhub_db')
          .select('*', { count: 'exact', head: true })
          .or('thumbnail_url.is.null,thumbnail_url.eq.,thumbnail_url.eq.null');
        if (!error && typeof count === 'number') {
          return res.json({ count });
        }
      } catch (sbErr: any) {
        console.warn('[Supabase] Missing thumbnail count error:', sbErr.message);
      }
    }

    // 3. MongoDB fallback
    await connectToDatabase();
    const count = await PostModel.countDocuments({
      $or: [
        { thumbnail_url: null },
        { thumbnail_url: '' },
        { thumbnail_url: 'null' },
        { thumbnail_url: { $exists: false } },
      ],
    });
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch missing thumbnails count' });
  }
});
