/**
 * Thumbnail Generator Utility
 * Downloads/processes video from STREAM URL, checks aspect ratio:
 * - 16:9: Splits into 4 equal segments, extracts 1st frame of each, stitches into a 4-image grid (2x2).
 * - 9:16: Splits into 3 equal segments, extracts 1st frame of each, stitches into a 3-image grid (3 columns).
 * Output canvas is ALWAYS 16:9 aspect ratio (1280 x 720).
 */

export interface GeneratedThumbnailResult {
  url: string;
  isVertical: boolean;
  frameCount: number;
}

function seekVideo(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    const duration = video.duration || 10;
    const clamped = Math.min(Math.max(0.1, targetTime), Math.max(0.1, duration - 0.2));
    let isSettled = false;

    const onSeeked = () => {
      if (isSettled) return;
      isSettled = true;
      video.removeEventListener('seeked', onSeeked);
      // Wait for rendering tick
      requestAnimationFrame(() => {
        setTimeout(resolve, 80);
      });
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = clamped;

    // Safety timeout in case seeked event hangs
    setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    }, 3000);
  });
}

function captureCurrentFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export async function generateMultiGridThumbnail(
  streamUrl: string,
  id: string | number = 'thumb',
  signal?: AbortSignal
): Promise<GeneratedThumbnailResult> {
  if (signal?.aborted) {
    throw new DOMException('Thumbnail generation aborted', 'AbortError');
  }
  if (!streamUrl || typeof streamUrl !== 'string') {
    throw new Error('Valid video stream URL is required');
  }

  // Load video via same-origin stream-proxy to avoid CORS canvas taint
  const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Attach offscreen to ensure browser decodes video frames
  video.style.position = 'fixed';
  video.style.top = '-9999px';
  video.style.left = '-9999px';
  video.style.width = '16px';
  video.style.height = '16px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  const cleanup = () => {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore
    }
    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }
  };

  try {
    // 1. Wait for video metadata to determine dimensions and duration with CORS fallback and increased timeout threshold
    await new Promise<void>((resolve, reject) => {
      let isSettled = false;
      let attempt = 0; // 0 = proxy with crossOrigin anonymous, 1 = direct stream with crossOrigin anonymous, 2 = direct stream without crossOrigin

      const urlsToTry = [
        { src: proxyUrl, crossOrigin: 'anonymous' as const },
        { src: streamUrl, crossOrigin: 'anonymous' as const },
        { src: streamUrl, crossOrigin: null },
      ];

      const cleanupListeners = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('canplay', onLoaded);
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };

      const tryNextSource = () => {
        attempt++;
        if (attempt < urlsToTry.length) {
          const next = urlsToTry[attempt];
          if (next.crossOrigin) {
            video.crossOrigin = next.crossOrigin;
          } else {
            video.removeAttribute('crossorigin');
          }
          video.src = next.src;
          video.load();
        } else {
          // If metadata is already populated despite events
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            if (!isSettled) {
              isSettled = true;
              cleanupListeners();
              resolve();
            }
          } else {
            if (!isSettled) {
              isSettled = true;
              cleanupListeners();
              reject(new Error('Failed to load video stream metadata after CORS and proxy attempts'));
            }
          }
        }
      };

      const onLoaded = () => {
        if (isSettled) return;
        isSettled = true;
        cleanupListeners();
        resolve();
      };

      const onError = () => {
        if (isSettled) return;
        tryNextSource();
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('canplay', onLoaded);
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError);

      // Start initial load attempt
      const first = urlsToTry[0];
      video.crossOrigin = first.crossOrigin;
      video.src = first.src;
      video.load();

      // Increased metadata load timeout threshold (25 seconds for slow network streams / CDN latency)
      setTimeout(() => {
        if (!isSettled) {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            isSettled = true;
            cleanupListeners();
            resolve();
          } else if (attempt < urlsToTry.length - 1) {
            // Try fallback before outright rejecting
            tryNextSource();
          } else {
            isSettled = true;
            cleanupListeners();
            reject(new Error('Timed out waiting for video stream metadata (25s threshold exceeded)'));
          }
        }
      }, 25000);
    });

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    const duration = Math.max(video.duration || 10, 1);

    // 2. Check aspect ratio: width / height
    // 16:9 is ~1.777; 9:16 is ~0.5625
    // If width >= height -> 16:9 (or landscape). If height > width -> 9:16 (vertical).
    const aspectRatio = vWidth / vHeight;
    const isVertical = aspectRatio < 0.95; // 9:16 portrait video

    // 3. Calculate segment timestamps
    let timestamps: number[] = [];
    if (!isVertical) {
      // 16:9: Split into 4 equal segments, extract 1st frame of each segment
      const segmentLen = duration / 4;
      timestamps = [
        0.1, // 1st frame of segment 1 (slight offset to avoid black start)
        segmentLen * 1, // 1st frame of segment 2
        segmentLen * 2, // 1st frame of segment 3
        segmentLen * 3, // 1st frame of segment 4
      ];
    } else {
      // 9:16: Split into 3 equal segments, extract 1st frame of each segment
      const segmentLen = duration / 3;
      timestamps = [
        0.1, // 1st frame of segment 1
        segmentLen * 1, // 1st frame of segment 2
        segmentLen * 2, // 1st frame of segment 3
      ];
    }

    // 4. Extract frames sequentially
    const extractedFrames: HTMLCanvasElement[] = [];
    for (const t of timestamps) {
      await seekVideo(video, t);
      const frame = captureCurrentFrame(video);
      extractedFrames.push(frame);
    }

    // 5. Output canvas/frame size for generated thumbnail must ALWAYS be 16:9
    const outWidth = 1280;
    const outHeight = 720; // 1280 / 720 = exactly 16:9
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // Clean neutral dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, outWidth, outHeight);

    if (!isVertical) {
      // 16:9 -> 4-image grid (2 columns x 2 rows)
      const cellW = outWidth / 2; // 640
      const cellH = outHeight / 2; // 360

      const positions = [
        { x: 0, y: 0 },
        { x: cellW, y: 0 },
        { x: 0, y: cellH },
        { x: cellW, y: cellH },
      ];

      for (let i = 0; i < 4; i++) {
        const frame = extractedFrames[i];
        const pos = positions[i];
        if (frame) {
          // Draw frame into cell (centered / cover)
          const fRatio = frame.width / frame.height;
          const cRatio = cellW / cellH;
          let sw = frame.width;
          let sh = frame.height;
          let sx = 0;
          let sy = 0;

          if (fRatio > cRatio) {
            sw = frame.height * cRatio;
            sx = (frame.width - sw) / 2;
          } else {
            sh = frame.width / cRatio;
            sy = (frame.height - sh) / 2;
          }

          ctx.drawImage(frame, sx, sy, sw, sh, pos.x, pos.y, cellW, cellH);
        }
      }

      // Elegant divider grid lines
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // vertical divider
      ctx.moveTo(cellW, 0);
      ctx.lineTo(cellW, outHeight);
      // horizontal divider
      ctx.moveTo(0, cellH);
      ctx.lineTo(outWidth, cellH);
      ctx.stroke();
    } else {
      // 9:16 -> 3-image grid (3 columns side by side on 16:9 canvas)
      const colW = outWidth / 3; // 426.67px

      for (let i = 0; i < 3; i++) {
        const frame = extractedFrames[i];
        const dx = i * colW;
        if (frame) {
          // Draw vertical frame into column (covering full height)
          const fRatio = frame.width / frame.height;
          const cRatio = colW / outHeight;
          let sw = frame.width;
          let sh = frame.height;
          let sx = 0;
          let sy = 0;

          if (fRatio > cRatio) {
            sw = frame.height * cRatio;
            sx = (frame.width - sw) / 2;
          } else {
            sh = frame.width / cRatio;
            sy = (frame.height - sh) / 2;
          }

          ctx.drawImage(frame, sx, sy, sw, sh, dx, 0, colW, outHeight);
        }
      }

      // Divider lines between the 3 columns
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(colW, 0);
      ctx.lineTo(colW, outHeight);
      ctx.moveTo(colW * 2, 0);
      ctx.lineTo(colW * 2, outHeight);
      ctx.stroke();
    }

    const dataUrl = outCanvas.toDataURL('image/webp', 0.80);

    // 6. Upload generated thumbnail directly to Cloudflare R2 bucket via backend API
    let finalUrl = dataUrl;
    try {
      const res = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          imageBase64: dataUrl,
          id: String(id),
          postId: String(id),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.url || json.thumbnail_url) {
          finalUrl = json.url || json.thumbnail_url;
        }
      }
    } catch (uploadErr: any) {
      if (uploadErr?.name === 'AbortError' || signal?.aborted) throw uploadErr;
      console.warn('Cloudflare R2 thumbnail upload notice, using generated image data URL:', uploadErr);
    }

    cleanup();

    return {
      url: finalUrl,
      isVertical,
      frameCount: isVertical ? 3 : 4,
    };
  } catch (err: any) {
    cleanup();
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    console.warn('Client-side video metadata fetch/processing encountered an error, routing to backend FFmpeg processing endpoint...', err?.message || err);

    // Fallback: Route request to backend FFmpeg processing endpoint with direct Cloudflare R2 upload
    try {
      const ffmpegRes = await fetch('/api/thumbnails/generate-ffmpeg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          streamUrl,
          id: String(id),
          postId: String(id),
        }),
      });

      if (ffmpegRes.ok) {
        const ffmpegData = await ffmpegRes.json();
        const r2ThumbUrl = ffmpegData?.url || ffmpegData?.thumbnail_url;
        if (r2ThumbUrl) {
          return {
            url: r2ThumbUrl,
            isVertical: Boolean(ffmpegData.isVertical),
            frameCount: ffmpegData.frameCount || (ffmpegData.isVertical ? 3 : 4),
          };
        }
      }
      const errJson = await ffmpegRes.json().catch(() => ({}));
      throw new Error(errJson.error || `Backend FFmpeg processing failed with status ${ffmpegRes.status}`);
    } catch (ffmpegErr: any) {
      console.error('Both client-side and backend FFmpeg thumbnail generation failed:', ffmpegErr);
      // Catch gracefully with clean error message
      throw new Error(`Thumbnail generation failed: ${ffmpegErr.message || err.message || 'Stream processing timed out'}`);
    }
  }
}
