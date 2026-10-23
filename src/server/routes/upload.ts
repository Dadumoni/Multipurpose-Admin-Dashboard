import express from 'express';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import sharp from 'sharp';
import axios from 'axios';
import { getR2Client, getR2PublicUrl } from '../r2Helper.js';
import { supabase } from '../db.js';
import { invalidatePostsCache } from '../cache.js';

export const uploadRouter = express.Router();

const videoUpload = multer({
  dest: path.join(os.tmpdir(), 'uploads'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB maximum
});

/**
 * Universal composite thumbnail generator using FFmpeg and Cloudflare R2
 */
async function generateAndUploadThumbnail(localVideoPath: string, prefixId: string): Promise<string | null> {
  const tmpDir = path.resolve(os.tmpdir(), `composite-thumb-${Date.now()}-${prefixId}`);
  try {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

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

    const outputGridPath = path.join(tmpDir, `composite_thumb_${Date.now()}.jpg`);
    let ffmpegFilterArgs: string[] = [];

    if (!isVertical && existingFrames.length >= 4) {
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

// 1. POST /api/upload/thumbnail
uploadRouter.post('/api/upload/thumbnail', async (req, res) => {
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

    const s3 = getR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: uploadBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    await s3.send(command);

    const r2PublicUrl = getR2PublicUrl(r2Key);
    console.log(`[Cloudflare R2] Thumbnail uploaded directly to R2 bucket "${bucket}": ${r2PublicUrl}`);

    const targetPostId = postId || (id !== 'thumb' ? id : undefined);
    if (targetPostId) {
      try {
        const numId = Number(targetPostId);
        if (!isNaN(numId)) {
          await supabase.from('viralhub_db').update({ thumbnail_url: r2PublicUrl }).eq('id', numId);
        } else {
          await supabase.from('viralhub_db').update({ thumbnail_url: r2PublicUrl }).or(`video_id.eq.${targetPostId},video_url.eq.${targetPostId}`);
        }
        invalidatePostsCache();
      } catch (dbErr) {
        console.warn('[Cloudflare R2] Supabase update notice:', dbErr);
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

// 2. POST /api/thumbnails/generate-ffmpeg
uploadRouter.post('/api/thumbnails/generate-ffmpeg', async (req, res) => {
  try {
    const { streamUrl, id = 'thumb' } = req.body;
    if (!streamUrl || typeof streamUrl !== 'string') {
      return res.status(400).json({ error: 'Valid streamUrl is required' });
    }

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

    let timestamps: number[] = [];
    if (!isVertical) {
      const seg = validDuration / 4;
      timestamps = [0.1, seg * 1, seg * 2, seg * 3];
    } else {
      const seg = validDuration / 3;
      timestamps = [0.1, seg * 1, seg * 2];
    }

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

      await new Promise<void>((resolve) => {
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
          resolve();
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

    for (const fp of framePaths) {
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    try { if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir); } catch {}

    const fileBuffer = fs.readFileSync(finalOutputPath);
    try { if (fs.existsSync(finalOutputPath)) fs.unlinkSync(finalOutputPath); } catch {}

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

    const targetPostId = req.body.postId || (id !== 'thumb' ? id : undefined);
    if (targetPostId) {
      try {
        const numId = Number(targetPostId);
        if (!isNaN(numId)) {
          await supabase.from('viralhub_db').update({ thumbnail_url: finalUrl }).eq('id', numId);
        } else {
          await supabase.from('viralhub_db').update({ thumbnail_url: finalUrl }).or(`video_id.eq.${targetPostId},video_url.eq.${targetPostId}`);
        }
        invalidatePostsCache();
      } catch (dbErr) {
        console.warn('[Cloudflare R2] Supabase update notice:', dbErr);
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

// 3. POST /api/upload/image
uploadRouter.post('/api/upload/image', videoUpload.single('file'), async (req, res) => {
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

// 4. POST /api/upload - Server-side upload proxy to ZeroStorage
uploadRouter.post('/api/upload', videoUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const title = (req.body.title || file.originalname || 'video').trim();
  const tempPath = file.path;

  try {
    console.log(`[Upload API] Processing "${file.originalname}" (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

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
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
  }
});

// 5. POST /api/upload/r2-presigned
uploadRouter.post('/api/upload/r2-presigned', async (req, res) => {
  try {
    const { fileName, contentType, folder = '' } = req.body;
    const key = folder ? `${folder}/${fileName}` : fileName;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const s3 = getR2Client();
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const publicUrl = getR2PublicUrl(key);

    res.json({ uploadUrl: url, publicUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// 6. GET /api/stream-proxy
uploadRouter.get('/api/stream-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send('Video URL parameter is required');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (req.headers.range) {
      headers['range'] = req.headers.range as string;
    }

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
    let contentType = String(response.headers['content-type'] || '');
    if (!contentType || contentType === 'text/plain' || targetUrl.includes('.mp4') || targetUrl.includes('zerostorage')) {
      contentType = 'video/mp4';
    }
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');

    response.data.pipe(res);
  } catch (error: any) {
    console.error('Stream proxy error:', error?.message);
    res.status(502).send('Error streaming media');
  }
});

// 7. GET /api/image-optimizer
const imageCacheDir = path.join(process.cwd(), 'node_modules', '.cache', 'optimized-images');
try {
  if (!fs.existsSync(imageCacheDir)) {
    fs.mkdirSync(imageCacheDir, { recursive: true });
  }
} catch {}

uploadRouter.get('/api/image-optimizer', async (req, res) => {
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

    if (fs.existsSync(cachedFilePath)) {
      res.setHeader('Content-Type', `image/${chosenFormat}`);
      return fs.createReadStream(cachedFilePath).pipe(res);
    }

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

    let transform = sharp(inputBuffer).resize({ width, withoutEnlargement: true });

    if (chosenFormat === 'avif') {
      transform = transform.avif({ quality, effort: 3 });
    } else {
      transform = transform.webp({ quality, effort: 4 });
    }

    const outputBuffer = await transform.toBuffer();
    fs.promises.writeFile(cachedFilePath, outputBuffer).catch(() => {});

    res.setHeader('Content-Type', `image/${chosenFormat}`);
    res.setHeader('Content-Length', String(outputBuffer.length));
    return res.send(outputBuffer);
  } catch (err: any) {
    const targetUrl = req.query.url as string;
    if (targetUrl) {
      return res.redirect(targetUrl);
    }
    return res.status(500).send('Image optimization failed');
  }
});
