import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { runSync, getSyncStatus, startPeriodicSync, syncPostMutation, isDbSyncEnabled, setDbSyncEnabled, migrateMongoToSupabase, isMigrationRunning, getMigrationProgress } from './src/server/sync.js';
import { initConsoleLogger, getLogs, clearLogs } from './src/server/logger.js';
import { connectToDatabase, PostModel, UploadedVideoModel, TrackedFileModel } from './src/lib/mongodb.js';
import { getDashboardStats, recalculateStats, initStatsChangeStream, scheduleDebouncedRecalculate } from './src/server/statsManager.js';
import {
  startBot,
  stopBot,
  getBotDashboardData,
  toggleChannelActive,
  removeChannel,
  addChannelManual,
  postToChannel,
  setCustomText,
  setHourlyPostsPerChannel,
  triggerHourlyJobNow,
} from './src/server/telegramPosterBot.js';
import {
  initScraperManager,
  getAllScrapersInfo,
  runSiteScraper,
  stopSiteScraper,
  startSiteScraper,
} from './src/server/scrapers/scraperManager.js';
import { cacheGet, cacheSet, invalidatePostsCache } from './src/server/cache.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import axios from 'axios';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import sharp from 'sharp';

dotenv.config();
initConsoleLogger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

function getSupabaseBackupClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

function asyncBackupDelete(field: string, value: any) {
  const sb = getSupabaseBackupClient();
  if (!sb) return;
  sb.from('post').delete().eq(field, value).then(() => {}, () => {});
  sb.from('posts').delete().eq(field, value).then(() => {}, () => {});
}

function asyncBackupInDelete(field: string, values: any[]) {
  const sb = getSupabaseBackupClient();
  if (!sb || values.length === 0) return;
  sb.from('post').delete().in(field, values).then(() => {}, () => {});
  sb.from('posts').delete().in(field, values).then(() => {}, () => {});
}

function asyncBackupUpsert(_records: any[]) {
  // Disabled: MongoDB -> Supabase copy only runs when the user explicitly clicks DB Sync
}

// Auto-detect public URL or use environment variable (APP_URL)
let detectedPublicUrl = (process.env.APP_URL || '').trim();

function startKeepAliveWorker(serverPort: number) {
  // Free tier instances sleep when idle. Ping every 5 minutes (300000 ms) to prevent sleeping.
  const intervalMs = 300000;

  const getTargetUrl = () => {
    const base = detectedPublicUrl || (process.env.APP_URL || '').trim();
    if (base) {
      return `${base.replace(/\/+$/, '')}/ping`;
    }
    return `http://127.0.0.1:${serverPort}/ping`;
  };

  const pingSelf = async () => {
    const targetUrl = getTargetUrl();
    try {
      const startTime = Date.now();
      const res = await axios.get(targetUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Koyeb-KeepAlive-Worker/1.0',
          'X-Keep-Alive-Ping': 'true',
        },
      });
      const latency = Date.now() - startTime;
      console.log(`[Keep-Alive] Ping to ${targetUrl} successful - HTTP ${res.status} (${latency}ms)`);
    } catch (err: any) {
      console.warn(`[Keep-Alive] Self-ping notice for ${targetUrl}: ${err?.message || err}`);
    }
  };

  // Initial ping after 20 seconds to confirm keep-alive functionality
  const initialTimer = setTimeout(() => {
    pingSelf();
  }, 20000);

  // Background recurring ping every 5 minutes (300000 ms)
  const intervalTimer = setInterval(() => {
    pingSelf();
  }, intervalMs);

  if (initialTimer.unref) initialTimer.unref();
  if (intervalTimer.unref) intervalTimer.unref();

  console.log(`[Keep-Alive] Auto-ping worker active (interval: 5 minutes / ${intervalMs}ms)`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Host detection middleware: dynamically tracks public host from incoming requests if APP_URL is not set
  app.use((req, _res, next) => {
    if (!detectedPublicUrl) {
      const forwardedHost = req.get('x-forwarded-host') || req.get('host');
      if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
        const proto = req.get('x-forwarded-proto') || 'https';
        detectedPublicUrl = `${proto}://${forwardedHost}`;
        console.log(`[Keep-Alive] Auto-detected public app URL: ${detectedPublicUrl}`);
      }
    }
    next();
  });

  // Lightweight keep-alive endpoint for Koyeb health checks and self-ping worker
  app.get(['/ping', '/api/ping'], (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Cloudflare R2 S3-Compatible Client Helper
  function getR2Client(): S3Client {
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
    const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    return new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
      },
    });
  }

  // Helper to obtain the public domain URL for an uploaded file on Cloudflare R2 using R2_PUBLIC_URL
  function getR2PublicUrl(key: string): string {
    const rawPublicUrl = (process.env.R2_PUBLIC_URL || '').trim();
    const cleanKey = key.replace(/^\/+/, '');

    if (rawPublicUrl) {
      const formattedBase = rawPublicUrl.startsWith('http://') || rawPublicUrl.startsWith('https://')
        ? rawPublicUrl
        : `https://${rawPublicUrl}`;
      return `${formattedBase.replace(/\/+$/, '')}/${cleanKey}`;
    }

    const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
    if (accountId) {
      return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${cleanKey}`;
    }
    return `https://${bucket}.r2.cloudflarestorage.com/${cleanKey}`;
  }

  const s3Client = getR2Client();

  // 1. R2 Upload Logic: Upload generated thumbnail image directly to Cloudflare R2 bucket
  // 2. Database & State Update: Resolve public/custom domain R2 URL and update thumbnail_url in database
  app.post('/api/upload/thumbnail', async (req, res) => {
    try {
      const { imageBase64, id = 'thumb', postId } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const rawBuffer = Buffer.from(base64Data, 'base64');

      let uploadBuffer = rawBuffer;
      let contentType = 'image/webp';
      let extension = 'webp';

      try {
        uploadBuffer = await sharp(rawBuffer)
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
      } catch (sharpErr) {
        console.warn('[Sharp] WebP conversion fallback, uploading raw image buffer:', sharpErr);
        contentType = imageBase64.includes('image/png') ? 'image/png' : 'image/jpeg';
        extension = imageBase64.includes('image/png') ? 'png' : 'jpg';
      }

      const filename = `thumb-${id}-${Date.now()}.${extension}`;
      const r2Key = `thumbnails/${filename}`;
      const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();

      // Upload directly to Cloudflare R2 bucket using S3-compatible SDK
      const s3 = getR2Client();
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: uploadBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      });
      await s3.send(command);

      // Get the public/custom domain URL for the uploaded thumbnail on Cloudflare R2
      const r2PublicUrl = getR2PublicUrl(r2Key);
      console.log(`[Cloudflare R2] Thumbnail uploaded directly to R2 bucket "${bucket}": ${r2PublicUrl}`);

      // Save/update this Cloudflare R2 URL into the thumbnail_url column in MongoDB database
      const targetPostId = postId || (id !== 'thumb' ? id : undefined);
      if (targetPostId) {
        try {
          await connectToDatabase();
          const isValidMongoId = mongoose.isValidObjectId(targetPostId);
          const numId = Number(targetPostId);
          const filter = !isNaN(numId)
            ? (isValidMongoId ? { $or: [{ id: numId }, { _id: targetPostId }, { video_id: String(targetPostId) }] } : { $or: [{ id: numId }, { video_id: String(targetPostId) }] })
            : (isValidMongoId ? { $or: [{ _id: targetPostId }, { video_id: String(targetPostId) }] } : { $or: [{ video_id: String(targetPostId) }, { video_url: targetPostId }] });

          const updatedPost = await PostModel.findOneAndUpdate(
            filter,
            { $set: { thumbnail_url: r2PublicUrl } },
            { returnDocument: 'after' }
          );

          if (updatedPost?.video_url) {
            asyncBackupUpsert([{
              title: updatedPost.title,
              video_url: updatedPost.video_url,
              thumbnail_url: r2PublicUrl,
            }]);
          }
          invalidatePostsCache();
          console.log(`[Cloudflare R2] Updated thumbnail_url in database for post ${targetPostId}: ${r2PublicUrl}`);
        } catch (dbErr) {
          console.warn('[Cloudflare R2] Database update notice:', dbErr);
        }
      }

      return res.json({
        success: true,
        url: r2PublicUrl,
        thumbnail_url: r2PublicUrl,
        key: r2Key,
      });
    } catch (error: any) {
      console.error('Failed to upload thumbnail to Cloudflare R2:', error);
      res.status(500).json({ error: error.message || 'Failed to upload thumbnail to Cloudflare R2' });
    }
  });

  // Backend FFmpeg fallback for multi-grid thumbnail generation
  app.post('/api/thumbnails/generate-ffmpeg', async (req, res) => {
    try {
      const { streamUrl, id = 'thumb' } = req.body;
      if (!streamUrl || typeof streamUrl !== 'string') {
        return res.status(400).json({ error: 'Valid streamUrl is required' });
      }

      // Step 1: Probe video dimensions and duration using ffprobe
      const probeData: { width: number; height: number; duration: number } = await new Promise((resolve, reject) => {
        const ffprobeProc = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'stream=width,height,duration',
          '-show_entries', 'format=duration',
          '-of', 'json',
          streamUrl,
        ]);

        let stdout = '';
        let stderr = '';
        ffprobeProc.stdout.on('data', (d) => { stdout += d.toString(); });
        ffprobeProc.stderr.on('data', (d) => { stderr += d.toString(); });

        const timer = setTimeout(() => {
          ffprobeProc.kill('SIGKILL');
          reject(new Error('ffprobe timed out'));
        }, 15000);

        ffprobeProc.on('close', (code) => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(stdout || '{}');
            const stream = parsed.streams?.find((s: any) => s.width && s.height) || {};
            const width = Number(stream.width) || 1280;
            const height = Number(stream.height) || 720;
            const duration = Number(stream.duration || parsed.format?.duration) || 10;
            resolve({ width, height, duration });
          } catch (e) {
            reject(new Error(stderr || 'Failed to parse ffprobe output'));
          }
        });

        ffprobeProc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const { width, height, duration } = probeData;
      const aspectRatio = width / height;
      const isVertical = aspectRatio < 0.95;
      const validDuration = Math.max(duration, 1);

      // Determine frame extraction timestamps
      let timestamps: number[] = [];
      if (!isVertical) {
        // 16:9: Split into 4 equal segments, 1st frame of each
        const seg = validDuration / 4;
        timestamps = [0.1, seg * 1, seg * 2, seg * 3];
      } else {
        // 9:16: Split into 3 equal segments, 1st frame of each
        const seg = validDuration / 3;
        timestamps = [0.1, seg * 1, seg * 2];
      }

      // Extract frames to system temp directory (cleaned up after composition)
      const tmpDir = path.resolve(os.tmpdir(), `r2-thumb-tmp-${Date.now()}`);
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const sessionPrefix = `ffmpeg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const framePaths: string[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const frameFile = path.join(tmpDir, `${sessionPrefix}-frame-${i}.jpg`);
        framePaths.push(frameFile);
        const t = Math.max(0.1, Math.min(timestamps[i], validDuration - 0.2)).toFixed(2);

        await new Promise<void>((resolve, reject) => {
          const ffmpegFrame = spawn('ffmpeg', [
            '-ss', t,
            '-i', streamUrl,
            '-vframes', '1',
            '-q:v', '2',
            '-y',
            frameFile,
          ]);

          const frameTimer = setTimeout(() => {
            ffmpegFrame.kill('SIGKILL');
            resolve(); // fallback continues even if single frame times out
          }, 12000);

          ffmpegFrame.on('close', () => {
            clearTimeout(frameTimer);
            resolve();
          });
          ffmpegFrame.on('error', () => {
            clearTimeout(frameTimer);
            resolve();
          });
        });
      }

      // Compose final 16:9 (1280x720) grid image using ffmpeg filter_complex
      const finalFilename = `thumb-${id}-${Date.now()}.jpg`;
      const finalDir = path.resolve(os.tmpdir(), 'r2-thumbnails');
      if (!fs.existsSync(finalDir)) {
        fs.mkdirSync(finalDir, { recursive: true });
      }
      const finalOutputPath = path.join(finalDir, finalFilename);

      const existingFrames = framePaths.filter(f => fs.existsSync(f));
      if (existingFrames.length === 0) {
        throw new Error('FFmpeg failed to extract video frames');
      }

      let ffmpegArgs: string[] = [];
      if (!isVertical) {
        // 4 frames in 2x2 grid -> 1280x720
        // Use whatever frames we have, duplicating if needed
        const f0 = existingFrames[0] || existingFrames[0];
        const f1 = existingFrames[1] || f0;
        const f2 = existingFrames[2] || f1;
        const f3 = existingFrames[3] || f2;

        ffmpegArgs = [
          '-i', f0,
          '-i', f1,
          '-i', f2,
          '-i', f3,
          '-filter_complex',
          '[0:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[v0];' +
          '[1:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[v1];' +
          '[2:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[v2];' +
          '[3:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[v3];' +
          '[v0][v1]hstack=inputs=2[top];' +
          '[v2][v3]hstack=inputs=2[bottom];' +
          '[top][bottom]vstack=inputs=2[out]',
          '-map', '[out]',
          '-q:v', '2',
          '-y',
          finalOutputPath,
        ];
      } else {
        // 3 frames in 3 columns -> 1280x720 (each col is ~426x720)
        const f0 = existingFrames[0];
        const f1 = existingFrames[1] || f0;
        const f2 = existingFrames[2] || f1;

        ffmpegArgs = [
          '-i', f0,
          '-i', f1,
          '-i', f2,
          '-filter_complex',
          '[0:v]scale=426:720:force_original_aspect_ratio=increase,crop=426:720[v0];' +
          '[1:v]scale=428:720:force_original_aspect_ratio=increase,crop=428:720[v1];' +
          '[2:v]scale=426:720:force_original_aspect_ratio=increase,crop=426:720[v2];' +
          '[v0][v1][v2]hstack=inputs=3[out]',
          '-map', '[out]',
          '-q:v', '2',
          '-y',
          finalOutputPath,
        ];
      }

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegArgs);
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('FFmpeg grid composition timed out'));
        }, 15000);

        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0 && fs.existsSync(finalOutputPath)) {
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      // Cleanup temp frame files and temp dir
      for (const fp of framePaths) {
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
      }
      try { if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir); } catch {}

      // Read output buffer and immediately remove local file (no local static storage)
      const fileBuffer = fs.readFileSync(finalOutputPath);
      try { if (fs.existsSync(finalOutputPath)) fs.unlinkSync(finalOutputPath); } catch {}

      // Upload directly to Cloudflare R2 bucket using S3-compatible SDK
      const s3 = getR2Client();
      const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();
      const r2Key = `thumbnails/${finalFilename}`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: fileBuffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      });
      await s3.send(command);

      const finalUrl = getR2PublicUrl(r2Key);
      console.log(`[Cloudflare R2] Successfully uploaded FFmpeg thumbnail to R2 bucket "${bucket}": ${finalUrl}`);

      // Save/update this Cloudflare R2 URL into the thumbnail_url column in MongoDB database
      const targetPostId = req.body.postId || (id !== 'thumb' ? id : undefined);
      if (targetPostId) {
        try {
          await connectToDatabase();
          const isValidMongoId = mongoose.isValidObjectId(targetPostId);
          const numId = Number(targetPostId);
          const filter = !isNaN(numId)
            ? (isValidMongoId ? { $or: [{ id: numId }, { _id: targetPostId }, { video_id: String(targetPostId) }] } : { $or: [{ id: numId }, { video_id: String(targetPostId) }] })
            : (isValidMongoId ? { $or: [{ _id: targetPostId }, { video_id: String(targetPostId) }] } : { $or: [{ video_id: String(targetPostId) }, { video_url: targetPostId }] });

          const updated = await PostModel.findOneAndUpdate(
            filter,
            { $set: { thumbnail_url: finalUrl } },
            { returnDocument: 'after' }
          );

          if (updated?.video_url) {
            asyncBackupUpsert([{
              title: updated.title,
              video_url: updated.video_url,
              thumbnail_url: finalUrl,
            }]);
          }
          invalidatePostsCache();
          console.log(`[Cloudflare R2] Updated thumbnail_url in database for post ${targetPostId}: ${finalUrl}`);
        } catch (dbErr) {
          console.warn('[Cloudflare R2] Database update notice:', dbErr);
        }
      }

      res.json({
        success: true,
        url: finalUrl,
        thumbnail_url: finalUrl,
        key: r2Key,
        isVertical,
        frameCount: isVertical ? 3 : 4,
      });
    } catch (error: any) {
      console.error('Backend FFmpeg thumbnail generation error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate thumbnail via FFmpeg' });
    }
  });


  /**
   * Universal composite thumbnail generator using FFmpeg and Cloudflare R2
   * Analyzes aspect ratio (16:9 -> 4 frames in 2x2 grid, 9:16 -> 3 frames in 3 columns)
   * Stitches into 16:9 1280x720 canvas, uploads to R2, and returns the public URL.
   */
  async function generateAndUploadThumbnail(localVideoPath: string, prefixId: string): Promise<string | null> {
    const tmpDir = path.resolve(os.tmpdir(), `composite-thumb-${Date.now()}-${prefixId}`);
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // 1. Probe video dimensions and duration using ffprobe
      const probeData = await new Promise<{ width: number; height: number; duration: number }>((resolve) => {
        const ffprobeProc = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'stream=width,height,duration',
          '-show_entries', 'format=duration',
          '-of', 'json',
          localVideoPath,
        ]);

        let stdout = '';
        ffprobeProc.stdout.on('data', (d) => { stdout += d.toString(); });
        const timer = setTimeout(() => {
          ffprobeProc.kill('SIGKILL');
          resolve({ width: 1280, height: 720, duration: 10 });
        }, 12000);

        ffprobeProc.on('close', () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(stdout || '{}');
            const stream = parsed.streams?.find((s: any) => s.width && s.height) || {};
            const width = Number(stream.width) || 1280;
            const height = Number(stream.height) || 720;
            const duration = Number(stream.duration || parsed.format?.duration) || 10;
            resolve({ width, height, duration });
          } catch {
            resolve({ width: 1280, height: 720, duration: 10 });
          }
        });
        ffprobeProc.on('error', () => {
          clearTimeout(timer);
          resolve({ width: 1280, height: 720, duration: 10 });
        });
      });

      const { width, height, duration } = probeData;
      const isVertical = height > width;
      const validDuration = Math.max(duration, 1);
      const frameCount = isVertical ? 3 : 4;

      // 2. Extract frames at equidistant timestamps
      const framePaths: string[] = [];
      for (let i = 1; i <= frameCount; i++) {
        const targetSec = (validDuration / (frameCount + 1)) * i;
        const framePath = path.join(tmpDir, `frame_${i}.jpg`);
        framePaths.push(framePath);

        await new Promise<void>((resolve) => {
          const proc = spawn('ffmpeg', [
            '-ss', targetSec.toFixed(2),
            '-i', localVideoPath,
            '-vframes', '1',
            '-q:v', '2',
            '-y',
            framePath,
          ]);
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve();
          }, 10000);
          proc.on('close', () => {
            clearTimeout(timer);
            resolve();
          });
          proc.on('error', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      const existingFrames = framePaths.filter((fp) => fs.existsSync(fp) && fs.statSync(fp).size > 0);
      if (existingFrames.length === 0) {
        return null;
      }

      // 3. Compose final grid image
      const outputGridPath = path.join(tmpDir, `composite_thumb_${Date.now()}.jpg`);
      let ffmpegFilterArgs: string[] = [];

      if (!isVertical && existingFrames.length >= 4) {
        // 16:9: 4 frames in 2x2 grid -> 1280x720
        ffmpegFilterArgs = [
          '-i', existingFrames[0],
          '-i', existingFrames[1],
          '-i', existingFrames[2],
          '-i', existingFrames[3],
          '-filter_complex',
          '[0:v]scale=640:360[v0];[1:v]scale=640:360[v1];[2:v]scale=640:360[v2];[3:v]scale=640:360[v3];[v0][v1]hstack=inputs=2[top];[v2][v3]hstack=inputs=2[bot];[top][bot]vstack=inputs=2[out]',
          '-map', '[out]',
          '-q:v', '2',
          '-y',
          outputGridPath,
        ];
      } else if (isVertical && existingFrames.length >= 3) {
        // 9:16: 3 frames side-by-side -> 1280x720 (each column 426x720)
        ffmpegFilterArgs = [
          '-i', existingFrames[0],
          '-i', existingFrames[1],
          '-i', existingFrames[2],
          '-filter_complex',
          '[0:v]scale=426:720[v0];[1:v]scale=427:720[v1];[2:v]scale=427:720[v2];[v0][v1][v2]hstack=inputs=3[out]',
          '-map', '[out]',
          '-q:v', '2',
          '-y',
          outputGridPath,
        ];
      } else {
        // Single frame or fallback
        fs.copyFileSync(existingFrames[0], outputGridPath);
      }

      if (ffmpegFilterArgs.length > 0) {
        await new Promise<void>((resolve) => {
          const proc = spawn('ffmpeg', ffmpegFilterArgs);
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve();
          }, 15000);
          proc.on('close', () => {
            clearTimeout(timer);
            resolve();
          });
          proc.on('error', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      const finalPath = fs.existsSync(outputGridPath) ? outputGridPath : existingFrames[0];
      if (!fs.existsSync(finalPath)) return null;

      // 4. Upload generated grid thumbnail to Cloudflare R2
      const imageBuffer = fs.readFileSync(finalPath);
      const r2Key = `thumbnails/thumb-${prefixId}-${Date.now()}.jpg`;
      const s3 = getR2Client();
      const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      const publicUrl = getR2PublicUrl(r2Key);
      console.log(`[Thumbnail Engine] Uploaded grid thumbnail to R2: ${publicUrl}`);
      return publicUrl;
    } catch (err: any) {
      console.error('[Thumbnail Engine] Error generating thumbnail:', err?.message || err);
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  // Multer storage for handling large video file uploads in temp folder (up to 500 MB)
  const videoUpload = multer({
    dest: path.join(os.tmpdir(), 'uploads'),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB maximum
  });

  // POST /api/upload/image - Upload custom thumbnail image directly to Cloudflare R2
  app.post('/api/upload/image', videoUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const tempPath = file.path;
    try {
      const fileBytes = fs.readFileSync(tempPath);
      const ext = path.extname(file.originalname) || '.jpg';
      const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
      const prefix = crypto.randomBytes(6).toString('hex');
      const r2Key = `thumbnails/custom-${Date.now()}-${prefix}${cleanExt}`;
      const s3 = getR2Client();
      const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: fileBytes,
        ContentType: file.mimetype || 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      const publicUrl = getR2PublicUrl(r2Key);
      console.log(`[Cloudflare R2] Custom thumbnail uploaded: ${publicUrl}`);

      return res.json({
        success: true,
        url: publicUrl,
        thumbnailUrl: publicUrl,
        key: r2Key,
      });
    } catch (err: any) {
      console.error('[Cloudflare R2] Failed to upload custom image:', err);
      return res.status(500).json({ error: err.message || 'Failed to upload image' });
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }
  });

  // POST /api/upload - Server-side upload proxy to ZeroStorage Universal API
  // Bypasses browser CORS policy restrictions and attaches x-api-key securely
  app.post('/api/upload', videoUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const title = (req.body.title || file.originalname || 'video').trim();
    const tempPath = file.path;

    try {
      console.log(`[Upload API] Processing "${file.originalname}" (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

      // 1. Generate aspect-ratio adaptive thumbnail (16:9 4-grid or 9:16 3-column) via FFmpeg & R2
      // If skipThumbnail is set or custom thumbnailUrl is passed, bypass FFmpeg generation
      const skipThumbnail = req.body.skipThumbnail === 'true' || req.body.skipThumbnail === true;
      const customThumb = typeof req.body.thumbnailUrl === 'string' ? req.body.thumbnailUrl.trim() : '';

      let thumbnailUrl: string | null = customThumb || null;
      if (!skipThumbnail && !thumbnailUrl) {
        const prefixId = crypto.randomBytes(4).toString('hex');
        try {
          thumbnailUrl = await generateAndUploadThumbnail(tempPath, prefixId);
        } catch (thumbErr) {
          console.warn('[Upload API] Thumbnail generation notice:', thumbErr);
        }
      }

      // 2. Prepare file data and forward to ZeroStorage Universal API
      const fileBytes = fs.readFileSync(tempPath);
      const fileBlob = new File([fileBytes], file.originalname, { type: file.mimetype || 'video/mp4' });

      const formData = new FormData();
      formData.append('file', fileBlob);
      formData.append('title', title);

      const headers: Record<string, string> = {
        'User-Agent': 'ZeroStorage-Dashboard-Uploader/1.0',
      };
      if (process.env.ZEROSTORAGE_API_KEY) {
        headers['x-api-key'] = process.env.ZEROSTORAGE_API_KEY;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 minutes

      const zeroResponse = await fetch('https://upload.zerostorage.net/api/upload/universal', {
        method: 'POST',
        body: formData,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!zeroResponse.ok) {
        const errorText = await zeroResponse.text();
        console.error(`[Upload API] ZeroStorage error (${zeroResponse.status}):`, errorText);
        return res.status(zeroResponse.status).json({
          error: `ZeroStorage upload failed (${zeroResponse.status}): ${errorText}`,
        });
      }

      const result: any = await zeroResponse.json();
      console.log('[Upload API] ZeroStorage success:', result);

      const fileId = result.fileId || result.id || result.file_id || result.data?.fileId || result.data?.id;
      if (!fileId) {
        return res.status(500).json({ error: 'ZeroStorage response did not contain a valid fileId', data: result });
      }

      const embedUrl = `https://zerostorage.net/embed/${fileId}`;
      const downloadUrl = `https://zerostorage.net/api/files/download/${fileId}?track=true`;
      const viewUrl = result.viewUrl || embedUrl;

      // Calculate SHA-256 hash for deduplication
      const fileHash = crypto.createHash('sha256').update(fileBytes).digest('hex');

      return res.status(200).json({
        success: true,
        fileId: String(fileId),
        title,
        filename: file.originalname,
        size: file.size,
        thumbnailUrl,
        embedUrl,
        downloadUrl,
        viewUrl,
        fileHash,
        raw: result,
      });
    } catch (err: any) {
      console.error('[Upload API] Internal error:', err?.message || err);
      return res.status(500).json({
        error: err?.message || 'Failed to proxy upload to ZeroStorage',
      });
    } finally {
      // Clean up uploaded temporary file from server
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanErr) {
        console.warn('[Upload API] Temp cleanup warning:', cleanErr);
      }
    }
  });

  // API Route for R2 Presigned URL
  app.post('/api/upload/r2-presigned', async (req, res) => {
    try {
      const { fileName, contentType, folder = '' } = req.body;
      const key = folder ? `${folder}/${fileName}` : fileName;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

      res.json({ uploadUrl: url, publicUrl });
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      res.status(500).json({ error: 'Failed to generate presigned URL' });
    }
  });

  // API Route to Toggle DB Sync ON/OFF
  app.post('/api/sync/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled boolean field is required' });
      }

      await setDbSyncEnabled(enabled);
      const status = await getSyncStatus();
      res.json({
        success: true,
        message: enabled ? 'DB Sync turned ON' : 'DB Sync turned OFF',
        sync_enabled: enabled,
        status,
      });
    } catch (error: any) {
      console.error('Failed to toggle DB Sync:', error);
      res.status(500).json({ error: error.message || 'Failed to toggle DB Sync' });
    }
  });

  // API Route for Sync Status
  app.get('/api/sync/status', async (_req, res) => {
    try {
      const status = await getSyncStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get sync status' });
    }
  });

  // API Routes for Real-Time Terminal Logs & Migration Progress
  app.get('/api/logs', (req, res) => {
    try {
      const sinceId = typeof req.query.since === 'string' ? req.query.since : undefined;
      res.json({
        logs: getLogs(sinceId),
        migration: getMigrationProgress(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch logs' });
    }
  });

  app.post('/api/logs/clear', (_req, res) => {
    try {
      clearLogs();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to clear logs' });
    }
  });

  // Background Native Migration Runner (MongoDB videos_db.posts -> Supabase viralhub_db)
  app.post(['/api/sync/migrate', '/api/sync/python'], (_req, res) => {
    try {
      if (isMigrationRunning()) {
        return res.json({
          success: true,
          alreadyRunning: true,
          message: 'Copying MongoDB data to Supabase in background...',
          migration: getMigrationProgress(),
        });
      }

      // Run migration asynchronously in the background (logs progress/errors to terminal logger)
      migrateMongoToSupabase().catch((err) => {
        console.error('[DB Sync] Background migration error:', err?.message || err);
      });

      return res.json({
        success: true,
        message: 'Copying MongoDB data to Supabase in background...',
        migration: getMigrationProgress(),
      });
    } catch (error: any) {
      console.error('Failed to start DB Sync:', error);
      return res.status(500).json({ error: error.message || 'Failed to start DB Sync' });
    }
  });

  // API Route for triggering manual / auto bidirectional sync
  app.post('/api/sync', async (req, res) => {
    try {
      const result = await runSync(req.body);
      res.json(result);
    } catch (error: any) {
      console.error('Sync route error:', error);
      res.status(500).json({ error: error.message || 'Sync failed' });
    }
  });

  // =========================================================================
  // PRIMARY MONGODB API ROUTES: All normal application operations use MongoDB
  // =========================================================================

  // 1. GET /api/posts - Query MongoDB post collection
  app.get('/api/posts', async (req, res) => {
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
      if (domainParam && domainParam !== 'all') {
        const cleanDomain = domainParam.replace(/^www\./, '');
        andConditions.push({
          $or: [
            { domain: { $regex: cleanDomain, $options: 'i' } },
            { post_url: { $regex: cleanDomain, $options: 'i' } }
          ]
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
          ]
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

  // 1b. GET /api/posts/duplicates - Fast aggregation to detect duplicate video links in MongoDB
  app.get('/api/posts/duplicates', async (_req, res) => {
    try {
      await connectToDatabase();
      const dupAgg = await PostModel.aggregate([
        {
          $match: {
            video_url: { $type: 'string', $gt: 'http' }
          }
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
                is_expired: '$is_expired'
              }
            }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 100 }
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
              detail: group._id
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

  // 1c. GET /api/posts/:id - Fetch individual post details from MongoDB with all fields
  app.get('/api/posts/:id', async (req, res) => {
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

  // 1b. POST /api/posts - Create post in MongoDB (Primary) and mirror to Supabase (Backup)
  app.post('/api/posts', async (req, res) => {
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
        all_links
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

      invalidatePostsCache();

      // Background sync triggered ONLY during add/delete mutations on the posts collection
      syncPostMutation({ action: 'add', post: newPost }).catch(err => {
        console.warn('Background Supabase add sync error:', err?.message || err);
      });

      res.status(201).json({ success: true, data: newPost });
    } catch (error: any) {
      console.error('Failed to create post in MongoDB:', error);
      res.status(500).json({ error: error.message || 'Failed to create post' });
    }
  });

  // 2. DELETE /api/posts/:id - Delete single post from both MongoDB and Supabase (viralhub_db)
  app.delete('/api/posts/:id', async (req, res) => {
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
      invalidatePostsCache();
      scheduleDebouncedRecalculate(1000);

      // Delete from Supabase (viralhub_db) as well
      await syncPostMutation({ action: 'delete', post: existing, id: idParam });

      res.json({ success: true, message: `Post #${idParam} deleted from MongoDB and Supabase` });
    } catch (error: any) {
      console.error('Failed to delete post:', error);
      res.status(500).json({ error: error.message || 'Failed to delete post' });
    }
  });

  // 3. POST /api/posts/bulk-delete - Delete multiple posts from both MongoDB and Supabase (viralhub_db)
  app.post('/api/posts/bulk-delete', async (req, res) => {
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
      invalidatePostsCache();
      scheduleDebouncedRecalculate(1000);

      // Delete from Supabase (viralhub_db) as well
      await syncPostMutation({ action: 'delete', posts: postsToDelete, ids: strIds });

      res.json({ success: true, count: postsToDelete.length });
    } catch (error: any) {
      console.error('Failed to bulk delete posts:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk delete posts' });
    }
  });

  // 4. PATCH /api/posts/:id - Update post metadata in MongoDB
  app.patch('/api/posts/:id', async (req, res) => {
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
        all_links
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

      // Update backup in Supabase
      const effectiveUrl = updated.video_url || (updated as any)['720p_link'] || (updated as any)['480p_link'];
      if (effectiveUrl) {
        asyncBackupUpsert([{
          title: updated.title,
          video_url: effectiveUrl,
          thumbnail_url: updated.thumbnail_url || null,
        }]);
      }

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
      const res = await axios.head(url, {
        timeout: 3000,
        signal,
        validateStatus: () => true,
        httpAgent: httpCheckAgent,
        httpsAgent: httpsCheckAgent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (res.status === 405 || res.status === 403) {
        if (signal?.aborted) return false;
        const getRes = await axios.get(url, {
          timeout: 3000,
          signal,
          headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0' },
          validateStatus: () => true,
          responseType: 'stream',
          httpAgent: httpCheckAgent,
          httpsAgent: httpsCheckAgent,
        });
        if (getRes.data && typeof getRes.data.destroy === 'function') {
          getRes.data.destroy();
        }
        return getRes.status < 400;
      }
      return res.status < 400;
    } catch {
      return false;
    }
  }

  async function startCheckExpired() {
    if (checkExpiredState.checking) return;
    try {
      await connectToDatabase();
      // Include ALL posts/links in the scan, even if they are ALREADY marked as is_expired: true
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
        message: 'Scanning all video links in background...',
      };
      broadcastCheckExpiredState();

      const batchSize = 30;
      for (let i = 0; i < allPosts.length; i += batchSize) {
        if (signal.aborted || checkExpiredState.cancelRequested) {
          break;
        }

        const batch = allPosts.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (p: any) => {
            if (signal.aborted) return { _id: p._id, id: p.id, ok: false, wasExpired: Boolean(p.is_expired) };
            const targetUrl = p['720p_link'] || p['480p_link'] || (Array.isArray(p.all_links) && p.all_links[0]) || p.video_url;
            const ok = await checkSingleUrl(targetUrl, signal);
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

        // If a previously marked expired link passes the check (found active/valid), automatically remove the is_expired mark
        if (activeBatchIds.length > 0) {
          await PostModel.updateMany(
            { _id: { $in: activeBatchIds } },
            { $set: { is_expired: false, expired_checked_at: new Date() } }
          );
        }

        // If link fails the check, mark is_expired: true
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

  // GET /api/posts/expired/count - Returns count of expired video links (with caching)
  app.get('/api/posts/expired/count', async (_req, res) => {
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

  // GET /api/posts/check-expired/events - Server-Sent Events stream for real-time progress updates
  app.get('/api/posts/check-expired/events', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send immediate snapshot
    res.write(`data: ${JSON.stringify(checkExpiredState)}\n\n`);
    sseClients.add(res);

    _req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // GET /api/posts/check-expired/status - Status of ongoing/last URL expiration check
  app.get('/api/posts/check-expired/status', async (_req, res) => {
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

  // POST /api/posts/check-expired - Trigger persistent background scan to detect expired / unavailable video URLs
  app.post('/api/posts/check-expired', async (_req, res) => {
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

  // POST /api/posts/check-expired/stop - Stop ongoing scan via AbortController
  app.post('/api/posts/check-expired/stop', async (_req, res) => {
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

  // POST /api/posts/mark-expired - Update expired status in MongoDB after browser verification
  app.post('/api/posts/mark-expired', async (req, res) => {
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

  // 5. GET /api/uploaded-videos - List uploaded videos from MongoDB
  app.get('/api/uploaded-videos', async (_req, res) => {
    try {
      await connectToDatabase();
      const items = await UploadedVideoModel.find().sort({ created_at: -1 }).lean();
      res.json({ data: items });
    } catch (error: any) {
      console.error('Failed to query uploaded videos from MongoDB:', error);
      res.status(500).json({ error: error.message || 'Failed to query uploaded videos' });
    }
  });

  // 5b. GET /api/stream-proxy - Stream video with HTTP Range Requests for partial loading
  app.get('/api/stream-proxy', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).send('Video URL parameter is required');

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (req.headers.range) {
        headers['range'] = req.headers.range as string;
      }

      // If the target URL is from a known domain with hotlink protection, attach friendly referer
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname.includes('xxxindianstories')) {
          headers['Referer'] = 'https://www.xxxindianstories.com/';
        }
      } catch {}

      const response = await axios({
        method: 'GET',
        url: targetUrl,
        headers,
        responseType: 'stream',
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 20000,
      });

      res.status(response.status);
      res.set('Accept-Ranges', 'bytes');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Type, Content-Length');
      res.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      if (response.headers['content-range']) {
        res.set('Content-Range', String(response.headers['content-range']));
      }
      if (response.headers['content-length']) {
        res.set('Content-Length', String(response.headers['content-length']));
      }
      if (response.headers['content-type']) {
        res.set('Content-Type', String(response.headers['content-type']));
      }
      res.set('Cache-Control', 'public, max-age=86400');

      response.data.pipe(res);
    } catch (error: any) {
      console.error('Stream proxy error:', error?.message);
      res.status(502).send('Error streaming media');
    }
  });

  // 5c. GET /api/image-optimizer - Real-time Image Compression, Resizing & WebP/AVIF Converter
  const imageCacheDir = path.join(process.cwd(), 'node_modules', '.cache', 'optimized-images');
  try {
    if (!fs.existsSync(imageCacheDir)) {
      fs.mkdirSync(imageCacheDir, { recursive: true });
    }
  } catch {}

  app.get('/api/image-optimizer', async (req, res) => {
    try {
      const targetUrl = (req.query.url as string || '').trim();
      if (!targetUrl) {
        return res.status(400).send('Image URL parameter is required');
      }

      const width = Math.min(1920, Math.max(80, parseInt(req.query.w as string) || 480));
      const quality = Math.min(100, Math.max(40, parseInt(req.query.q as string) || 75));
      const requestedFormat = (req.query.format as string || '').toLowerCase();

      const acceptHeader = req.headers.accept || '';
      const chosenFormat = requestedFormat === 'avif' || (!requestedFormat && acceptHeader.includes('image/avif'))
        ? 'avif'
        : 'webp';

      const cacheKey = crypto.createHash('md5').update(`${targetUrl}|${width}|${quality}|${chosenFormat}`).digest('hex');
      const cachedFilePath = path.join(imageCacheDir, `${cacheKey}.${chosenFormat}`);
      const etag = `"${cacheKey}"`;

      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('ETag', etag);

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      // Check on-disk cache
      if (fs.existsSync(cachedFilePath)) {
        res.setHeader('Content-Type', `image/${chosenFormat}`);
        return fs.createReadStream(cachedFilePath).pipe(res);
      }

      // Download original image (with anti-hotlinking headers if needed)
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (targetUrl.includes('xxxindianstories')) {
        headers['Referer'] = 'https://www.xxxindianstories.com/';
      }

      const imgResponse = await axios({
        method: 'GET',
        url: targetUrl,
        headers,
        responseType: 'arraybuffer',
        timeout: 12000,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const inputBuffer = Buffer.from(imgResponse.data);

      let transform = sharp(inputBuffer)
        .resize({ width, withoutEnlargement: true });

      if (chosenFormat === 'avif') {
        transform = transform.avif({ quality, effort: 3 });
      } else {
        transform = transform.webp({ quality, effort: 4 });
      }

      const outputBuffer = await transform.toBuffer();

      // Write to cache in background
      fs.promises.writeFile(cachedFilePath, outputBuffer).catch(() => {});

      res.setHeader('Content-Type', `image/${chosenFormat}`);
      res.setHeader('Content-Length', String(outputBuffer.length));
      return res.send(outputBuffer);
    } catch (err: any) {
      // If image compression failed (e.g. invalid image or external domain timeout), redirect to original URL as fallback
      const targetUrl = req.query.url as string;
      if (targetUrl) {
        return res.redirect(targetUrl);
      }
      return res.status(500).send('Image optimization failed');
    }
  });

  // 6. POST /api/uploaded-videos - Create uploaded video in MongoDB
  app.post('/api/uploaded-videos', async (req, res) => {
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

      // Background sync triggered ONLY during add/delete mutations on the posts collection
      // Track file in dedicated TrackedFileModel collection to prevent duplicates
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
  app.delete('/api/uploaded-videos/:id', async (req, res) => {
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
        // Background sync triggered ONLY during add/delete mutations on the posts collection
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
  app.post('/api/uploaded-videos/bulk-delete', async (req, res) => {
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
        // Background sync triggered ONLY during add/delete mutations on the posts collection
        syncPostMutation({ action: 'delete', video_urls: urls }).catch(err => {
          console.warn('Background Supabase bulk delete sync error:', err?.message || err);
        });
      }

      res.json({ success: true, count: toDelete.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to bulk delete uploaded videos' });
    }
  });


  // 5c. GET /api/storage/stats - Calculate total storage used across uploaded files
  app.get('/api/storage/stats', async (_req, res) => {
    try {
      await connectToDatabase();
      const [uploadedVideos, trackedFiles] = await Promise.all([
        UploadedVideoModel.find().lean(),
        TrackedFileModel.find().lean(),
      ]);

      let totalBytes = 0;
      let totalFiles = uploadedVideos.length;

      for (const item of uploadedVideos) {
        if (item.file_size) {
          const match = String(item.file_size).match(/([0-9.]+)s*(MB|GB|KB|Bytes)?/i);
          if (match) {
            const val = parseFloat(match[1]);
            const unit = (match[2] || 'MB').toUpperCase();
            if (unit === 'GB') totalBytes += val * 1024 * 1024 * 1024;
            else if (unit === 'MB') totalBytes += val * 1024 * 1024;
            else if (unit === 'KB') totalBytes += val * 1024;
            else totalBytes += val;
          } else {
            totalBytes += 45 * 1024 * 1024; // default ~45 MB
          }
        } else {
          totalBytes += 45 * 1024 * 1024;
        }
      }

      // Format human readable
      let formattedSize = '0.0 MB';
      if (totalBytes >= 1024 * 1024 * 1024) {
        formattedSize = (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      } else {
        formattedSize = (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      res.json({
        totalFiles,
        totalBytes,
        formattedSize,
        limit: 'Infinite',
        isInfinite: true,
      });
    } catch (error: any) {
      console.warn('Storage stats calculation notice:', error?.message);
      res.json({
        totalFiles: 0,
        totalBytes: 0,
        formattedSize: '0.0 MB',
        limit: 'Infinite',
        isInfinite: true,
      });
    }
  });


  // 9. GET /api/overview - Aggregated overview statistics directly from MongoDB (cached)
  app.get('/api/overview', async (req, res) => {
    try {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)

      // Parse requested month and year, capping future dates to curYear / curMonth
      let targetYear = req.query.year ? parseInt(req.query.year as string, 10) : curYear;
      let targetMonth = req.query.month !== undefined ? parseInt(req.query.month as string, 10) : curMonth;

      if (isNaN(targetYear)) targetYear = curYear;
      if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) targetMonth = curMonth;

      // Limit navigation so users cannot pick future dates beyond current month/year
      if (targetYear > curYear || (targetYear === curYear && targetMonth > curMonth)) {
        targetYear = curYear;
        targetMonth = curMonth;
      }

      const cacheKey = `overview:stats:${targetYear}:${targetMonth}`;
      const cached = cacheGet<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      await connectToDatabase();

      const isForceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
      const [dashboardStats, recentUploaded] = await Promise.all([
        getDashboardStats(isForceRefresh),
        UploadedVideoModel.find().sort({ created_at: -1 }).limit(10).lean().catch(() => []),
      ]);

      const totalScraped = dashboardStats?.total_posts || 0;
      const totalUploaded = dashboardStats?.total_uploaded || 0;
      const totalVideos = dashboardStats?.total_videos || (totalScraped + totalUploaded);
      const totalViews = dashboardStats?.total_views || 0;
      const videoSources = dashboardStats?.video_sources || [];
      const recentPosts = dashboardStats?.recent_posts || [];

      // Target month boundaries
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, daysInMonth, 23, 59, 59, 999));

      const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthNamesLong = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthShort = monthNamesShort[targetMonth];
      const monthLong = monthNamesLong[targetMonth];

      // Fetch real dynamic daily traffic data from MongoDB for target month
      const [postDailyAgg, uploadedDailyAgg] = await Promise.all([
        PostModel.aggregate([
          { $match: { created_at: { $gte: startOfMonth, $lte: endOfMonth } } },
          { $group: { _id: { $dayOfMonth: '$created_at' }, views: { $sum: '$views' } } },
        ]),
        UploadedVideoModel.aggregate([
          { $match: { created_at: { $gte: startOfMonth, $lte: endOfMonth } } },
          { $group: { _id: { $dayOfMonth: '$created_at' }, views: { $sum: '$views' } } },
        ]),
      ]);

      const dailyViewsMap: Record<number, number> = {};
      for (const item of postDailyAgg) {
        dailyViewsMap[item._id] = (dailyViewsMap[item._id] || 0) + (item.views || 0);
      }
      for (const item of uploadedDailyAgg) {
        dailyViewsMap[item._id] = (dailyViewsMap[item._id] || 0) + (item.views || 0);
      }

      // Return 0 for dates with no activity
      const monthlyTraffic = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        monthlyTraffic.push({
          day,
          date: `${monthShort} ${dayStr}`,
          name: `${monthShort} ${dayStr}`,
          views: dailyViewsMap[day] || 0,
        });
      }

      // Calculate Trend Indicators for TOTAL VIDEOS
      const yesterdayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dayBeforeStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const [postsToday, postsYesterday, uploadedToday, uploadedYesterday] = await Promise.all([
        PostModel.countDocuments({ created_at: { $gte: yesterdayStart } }),
        PostModel.countDocuments({ created_at: { $gte: dayBeforeStart, $lt: yesterdayStart } }),
        UploadedVideoModel.countDocuments({ created_at: { $gte: yesterdayStart } }),
        UploadedVideoModel.countDocuments({ created_at: { $gte: dayBeforeStart, $lt: yesterdayStart } }),
      ]);
      const videosTodayTotal = postsToday + uploadedToday;
      const videosYesterdayTotal = postsYesterday + uploadedYesterday;
      const videosDiff = videosTodayTotal - videosYesterdayTotal;

      let videoTrend = {
        change: videosDiff,
        direction: 'neutral' as 'increase' | 'decrease' | 'neutral',
        label: 'No change since yesterday',
      };
      if (videosDiff > 0) {
        videoTrend = {
          change: videosDiff,
          direction: 'increase',
          label: `+${videosDiff} since yesterday`,
        };
      } else if (videosDiff < 0) {
        videoTrend = {
          change: videosDiff,
          direction: 'decrease',
          label: `${videosDiff} since yesterday`,
        };
      } else if (videosTodayTotal > 0) {
        videoTrend = {
          change: videosTodayTotal,
          direction: 'increase',
          label: `+${videosTodayTotal} today`,
        };
      }

      // Calculate Trend Indicators for TOTAL VIEWS (compare target month with prior month)
      const prevMonth = targetMonth === 0 ? 11 : targetMonth - 1;
      const prevYear = targetMonth === 0 ? targetYear - 1 : targetYear;
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
      const startOfPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0));
      const endOfPrevMonth = new Date(Date.UTC(prevYear, prevMonth, daysInPrevMonth, 23, 59, 59, 999));

      const [prevPostAgg, prevUploadedAgg] = await Promise.all([
        PostModel.aggregate([
          { $match: { created_at: { $gte: startOfPrevMonth, $lte: endOfPrevMonth } } },
          { $group: { _id: null, totalViews: { $sum: '$views' } } },
        ]),
        UploadedVideoModel.aggregate([
          { $match: { created_at: { $gte: startOfPrevMonth, $lte: endOfPrevMonth } } },
          { $group: { _id: null, totalViews: { $sum: '$views' } } },
        ]),
      ]);

      const currentMonthTotalViews = Object.values(dailyViewsMap).reduce((a, b) => a + b, 0);
      const prevMonthTotalViews = (prevPostAgg[0]?.totalViews || 0) + (prevUploadedAgg[0]?.totalViews || 0);
      const viewsDiff = currentMonthTotalViews - prevMonthTotalViews;

      let viewsPercent = 0;
      if (prevMonthTotalViews > 0) {
        viewsPercent = Math.round(((currentMonthTotalViews - prevMonthTotalViews) / prevMonthTotalViews) * 100);
      }

      let viewsTrend = {
        change: viewsDiff,
        percent: viewsPercent,
        direction: 'neutral' as 'increase' | 'decrease' | 'neutral',
        label: 'No change from last month',
      };
      if (viewsDiff > 0) {
        viewsTrend = {
          change: viewsDiff,
          percent: viewsPercent,
          direction: 'increase',
          label: viewsPercent > 0 ? `+${viewsPercent}% from last month` : `+${viewsDiff.toLocaleString()} views from last month`,
        };
      } else if (viewsDiff < 0) {
        viewsTrend = {
          change: viewsDiff,
          percent: viewsPercent,
          direction: 'decrease',
          label: viewsPercent < 0 ? `${viewsPercent}% from last month` : `${viewsDiff.toLocaleString()} views from last month`,
        };
      }

      // Check if 'visitors' collection exists in MongoDB
      let visitorsData = {
        available: false,
        message: "Collection 'visitors' does not exist in MongoDB.",
        devices: [] as { name: string; count: number; percentage: number }[],
        countries: [] as { name: string; count: number; percentage: number }[],
        browsers: [] as { name: string; count: number; percentage: number }[],
      };

      try {
        const collections = await mongoose.connection.db?.listCollections({ name: 'visitors' }).toArray();
        const hasVisitorsCollection = Boolean(collections && collections.length > 0);

        if (hasVisitorsCollection && mongoose.connection.db) {
          const visitorsCol = mongoose.connection.db.collection('visitors');
          const [deviceAgg, countryAgg, browserAgg] = await Promise.all([
            visitorsCol.aggregate([
              { $match: { $or: [{ visited_at: { $gte: startOfMonth, $lte: endOfMonth } }, { created_at: { $gte: startOfMonth, $lte: endOfMonth } }] } },
              { $group: { _id: '$device', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ]).toArray(),
            visitorsCol.aggregate([
              { $match: { $or: [{ visited_at: { $gte: startOfMonth, $lte: endOfMonth } }, { created_at: { $gte: startOfMonth, $lte: endOfMonth } }] } },
              { $group: { _id: '$country', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ]).toArray(),
            visitorsCol.aggregate([
              { $match: { $or: [{ visited_at: { $gte: startOfMonth, $lte: endOfMonth } }, { created_at: { $gte: startOfMonth, $lte: endOfMonth } }] } },
              { $group: { _id: '$browser', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ]).toArray(),
          ]);

          const totalDevCount = deviceAgg.reduce((acc, d) => acc + (d.count || 0), 0);
          const totalCountryCount = countryAgg.reduce((acc, c) => acc + (c.count || 0), 0);
          const totalBrowserCount = browserAgg.reduce((acc, b) => acc + (b.count || 0), 0);

          visitorsData = {
            available: true,
            message: '',
            devices: deviceAgg.map(d => ({
              name: d._id || 'Desktop',
              count: d.count || 0,
              percentage: totalDevCount > 0 ? Math.round(((d.count || 0) / totalDevCount) * 100) : 0,
            })),
            countries: countryAgg.map(c => ({
              name: c._id || 'Unknown',
              count: c.count || 0,
              percentage: totalCountryCount > 0 ? Math.round(((c.count || 0) / totalCountryCount) * 100) : 0,
            })),
            browsers: browserAgg.map(b => ({
              name: b._id || 'Chrome',
              count: b.count || 0,
              percentage: totalBrowserCount > 0 ? Math.round(((b.count || 0) / totalBrowserCount) * 100) : 0,
            })),
          };
        }
      } catch (visitorErr: any) {
        visitorsData = {
          available: false,
          message: `Unable to access visitors collection: ${visitorErr?.message || 'Database error'}`,
          devices: [],
          countries: [],
          browsers: [],
        };
      }

      const responsePayload = {
        stats: {
          totalVideos,
          totalViews,
          totalScraped,
          totalUploaded,
          currentMonth: monthLong,
          currentYear: targetYear,
          selectedMonth: targetMonth,
          selectedYear: targetYear,
          videoTrend,
          viewsTrend,
          videoSources,
          lastScrapedAt: dashboardStats?.last_scraped_at || null,
          statsUpdatedAt: dashboardStats?.updated_at || null,
        },
        videoSources,
        monthlyTraffic,
        visitors: visitorsData,
        recentPosts,
        recentUploaded,
      };

      cacheSet(cacheKey, responsePayload, 45);
      res.json(responsePayload);
    } catch (error: any) {
      console.error('Failed to calculate MongoDB overview stats:', error);
      res.status(500).json({ error: error.message || 'Failed to calculate overview stats' });
    }
  });

  // Fast direct read of dashboard_stats collection
  app.get('/api/stats/overview', async (req, res) => {
    try {
      const stats = await getDashboardStats(req.query.force === 'true');
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
    }
  });

  // Recalculate stats collection on demand
  app.post('/api/stats/recalculate', async (_req, res) => {
    try {
      const stats = await recalculateStats();
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to recalculate stats' });
    }
  });

  // --- Telegram Poster Bot API Routes ---
  app.get('/api/telegram-bot/status', async (_req, res) => {
    try {
      const data = await getBotDashboardData();
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch bot data' });
    }
  });

  app.post('/api/telegram-bot/start', async (_req, res) => {
    try {
      const result = await startBot();
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to start bot' });
    }
  });

  app.post('/api/telegram-bot/stop', async (_req, res) => {
    try {
      const result = await stopBot();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to stop bot' });
    }
  });

  app.post('/api/telegram-bot/channels/toggle', async (req, res) => {
    try {
      const { chatId, isActive } = req.body;
      if (!chatId) return res.status(400).json({ error: 'chatId is required' });
      const modified = await toggleChannelActive(chatId, Boolean(isActive));
      res.json({ success: true, modified });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/channels/remove', async (req, res) => {
    try {
      const { chatId } = req.body;
      if (!chatId) return res.status(400).json({ error: 'chatId is required' });
      const deleted = await removeChannel(chatId);
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/channels/add', async (req, res) => {
    try {
      const { chatId, channelName } = req.body;
      if (!chatId) return res.status(400).json({ error: 'chatId is required' });
      const result = await addChannelManual(chatId, channelName);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/channels/test-post', async (req, res) => {
    try {
      const { chatId } = req.body;
      if (!chatId) return res.status(400).json({ error: 'chatId is required' });
      const result = await postToChannel(chatId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/settings/custom-text', async (req, res) => {
    try {
      const { text } = req.body;
      await setCustomText(String(text || ''));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/settings/hourly-posts', async (req, res) => {
    try {
      const { count } = req.body;
      await setHourlyPostsPerChannel(Number(count));
      res.json({ success: true, count: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram-bot/run-hourly-now', async (_req, res) => {
    try {
      const result = await triggerHourlyJobNow();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Site Scraper API Routes ---
  app.get('/api/scrapers', async (_req, res) => {
    try {
      const sites = await getAllScrapersInfo();
      res.json({ success: true, sites });
    } catch (error: any) {
      console.error('[SiteScraper API] Failed to fetch scraper sites:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch scraper sites' });
    }
  });

  app.post('/api/scrapers/:id/run', async (req, res) => {
    try {
      const siteId = req.params.id;
      runSiteScraper(siteId).catch((err) => {
        console.error(`[SiteScraper API] Background run error for ${siteId}:`, err?.message || err);
      });
      res.json({ success: true, message: `Scraper execution started for "${siteId}"` });
    } catch (error: any) {
      console.error(`[SiteScraper API] Failed to run scraper ${req.params.id}:`, error);
      res.status(500).json({ error: error.message || 'Failed to start scraper' });
    }
  });

  app.post('/api/scrapers/:id/stop', async (req, res) => {
    try {
      const siteId = req.params.id;
      await stopSiteScraper(siteId);
      res.json({ success: true, message: `Scraper stopped for "${siteId}"` });
    } catch (error: any) {
      console.error(`[SiteScraper API] Failed to stop scraper ${req.params.id}:`, error);
      res.status(500).json({ error: error.message || 'Failed to stop scraper' });
    }
  });

  app.post('/api/scrapers/:id/start', async (req, res) => {
    try {
      const siteId = req.params.id;
      await startSiteScraper(siteId);
      res.json({ success: true, message: `Scraper restarted and enabled for "${siteId}"` });
    } catch (error: any) {
      console.error(`[SiteScraper API] Failed to start scraper ${req.params.id}:`, error);
      res.status(500).json({ error: error.message || 'Failed to start scraper' });
    }
  });

  // Start background auto sync runner
  startPeriodicSync();

  // Resolve frontend distribution paths
  const candidateDistPaths = [
    path.resolve(__dirname, 'dist'),
    path.resolve(process.cwd(), 'dist'),
  ];
  const distPath = candidateDistPaths.find(p => fs.existsSync(path.resolve(p, 'index.html'))) || candidateDistPaths[0];
  const distIndexHtml = path.resolve(distPath, 'index.html');
  const hasDist = fs.existsSync(distIndexHtml);

  // Candidate public directories
  const candidatePublicPaths = [
    path.resolve(__dirname, 'public'),
    path.resolve(process.cwd(), 'public'),
  ];
  const publicPath = candidatePublicPaths.find(p => fs.existsSync(p));

  // Isolated 404 handler for unknown /api/* endpoints - never serve index.html for API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.path}`,
    });
  });

  if (isProd || hasDist) {
    console.log(`[Static] Production mode active. Serving static build from: ${distPath}`);

    // Serve hashed assets (/assets/*) with immutable long-term caching
    const assetsDir = path.resolve(distPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve public assets (e.g. plyr.svg, thumbnails)
    if (publicPath && fs.existsSync(publicPath)) {
      app.use(express.static(publicPath, { maxAge: '1h' }));
    }

    // Serve root static files (e.g. robots.txt, favicon.ico) from dist
    app.use(express.static(distPath, {
      maxAge: '1h',
      index: false,
    }));

    // Client-side routing catch-all fallback: serve index.html for all page routes
    app.get('*', (req, res) => {
      // Return 404 for missing static files with extensions (e.g. missing .js or .css) to prevent MIME errors
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).type('text/plain').send('Static asset not found');
      }

      if (!fs.existsSync(distIndexHtml)) {
        console.error(`[Static Error] dist/index.html not found at ${distIndexHtml}`);
        return res.status(500).type('text/html').send(`
          <!doctype html>
          <html>
            <head><meta charset="utf-8"/><title>Deployment Notice</title></head>
            <body style="font-family:system-ui,sans-serif;background:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;">
              <div style="max-width:500px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
                <h2 style="margin:0 0 8px 0;font-size:18px;color:#ef4444;">Frontend Build Missing</h2>
                <p style="margin:0 0 16px 0;font-size:13px;color:#a1a1aa;line-height:1.5;">The application is running in production mode, but <code>dist/index.html</code> was not generated. Ensure <code>npm run build</code> runs before starting the server.</p>
                <button onclick="window.location.reload()" style="background:#fff;color:#000;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Retry</button>
              </div>
            </body>
          </html>
        `);
      }

      // Strictly disable caching for index.html so browsers never retain stale bundle hashes
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.sendFile(distIndexHtml);
    });
  } else {
    console.log('[Static] Development mode active. Mounting Vite middleware.');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
    startKeepAliveWorker(port);
    initStatsChangeStream().catch((err: any) => console.warn('[StatsManager] Change stream notice:', err.message));
    initScraperManager().catch((err: any) => console.warn('[SiteScraper] Manager init notice:', err.message));
  });
}

startServer();
