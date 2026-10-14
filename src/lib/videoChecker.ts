/**
 * Background HTML5 Video Player Verification Utility
 * Checks video URLs in a background browser context using native HTML5 video element.
 */

export interface VideoCheckResult {
  valid: boolean;
  error?: string;
}

/**
 * Checks a single video URL using an HTML5 video player in a background browser context.
 * - If the video loads and starts playing successfully, considers it valid.
 * - If the URL returns 404 or another error and the video cannot load/play, considers it expired.
 * - Waits for video loading result without marking slow initial requests as expired prematurely.
 */
export function checkVideoUrlWithHtml5Player(
  url: string,
  timeoutMs: number = 25000,
  signal?: AbortSignal
): Promise<VideoCheckResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ valid: false, error: 'Cancelled' });
      return;
    }

    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      resolve({ valid: false, error: 'Invalid or missing URL' });
      return;
    }

    // Create an offscreen HTML5 video element attached to the document
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';

    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    let isSettled = false;
    let timer: any = null;
    let lastProgressTimestamp = Date.now();

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('canplaythrough', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('waiting', onWaiting);

      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }

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

    const finish = (result: VideoCheckResult) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      finish({ valid: false, error: 'Cancelled' });
    };

    // Playback started successfully
    const onPlaying = () => {
      finish({ valid: true });
    };

    // Video frames are advancing or ready
    const onTimeUpdate = () => {
      if (video.currentTime > 0 || video.readyState >= 2) {
        finish({ valid: true });
      }
    };

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            finish({ valid: true });
          })
          .catch((err) => {
            // If autoplay is blocked despite being muted, but media has loaded frames (readyState >= 2)
            if (video.readyState >= 2 || video.videoWidth > 0) {
              finish({ valid: true });
            } else if (err.name === 'NotSupportedError') {
              finish({ valid: false, error: err.message || 'Media format not supported' });
            }
            // For other interruptions, let event listeners continue waiting
          });
      }
    };

    const onCanPlay = () => {
      tryPlay();
    };

    const onLoadedData = () => {
      tryPlay();
    };

    // 404, network error, or media decode error
    const onError = () => {
      const mediaErr = video.error;
      const errorMsg = mediaErr
        ? `Code ${mediaErr.code}: ${mediaErr.message || 'Media loading failed'}`
        : 'Failed to load video';
      finish({ valid: false, error: errorMsg });
    };

    // Activity tracking for slow connections/CDNs
    const onProgress = () => {
      lastProgressTimestamp = Date.now();
      if (video.readyState >= 2) {
        tryPlay();
      }
    };

    const onWaiting = () => {
      lastProgressTimestamp = Date.now();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('canplaythrough', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('error', onError);
    video.addEventListener('progress', onProgress);
    video.addEventListener('waiting', onWaiting);

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    try {
      document.body.appendChild(video);
      video.src = url;
      video.load();
    } catch (err: any) {
      finish({ valid: false, error: err?.message || 'Error initializing player' });
      return;
    }

    // Dynamic timeout watcher: waits longer if data is actively buffering/progressing
    const checkTimeout = () => {
      if (isSettled) return;
      const idleTime = Date.now() - lastProgressTimestamp;
      if (idleTime >= timeoutMs) {
        if (video.readyState >= 2 || video.videoWidth > 0) {
          finish({ valid: true });
        } else {
          finish({ valid: false, error: 'Video stream loading timed out' });
        }
      } else {
        const remaining = Math.max(1000, timeoutMs - idleTime);
        timer = setTimeout(checkTimeout, remaining);
      }
    };

    timer = setTimeout(checkTimeout, timeoutMs);
  });
}

export interface VideoItemToCheck {
  id: number | string;
  url: string;
}

export interface BatchCheckProgress {
  total: number;
  checked: number;
  expiredCount: number;
}

/**
 * Runs background video player checks with controlled concurrency.
 */
export async function batchCheckVideoUrls(
  items: VideoItemToCheck[],
  concurrency: number = 3,
  onProgress?: (progress: BatchCheckProgress) => void,
  signal?: AbortSignal
): Promise<{
  expiredIds: (number | string)[];
  validIds: (number | string)[];
}> {
  const expiredIds: (number | string)[] = [];
  const validIds: (number | string)[] = [];

  let currentIndex = 0;
  let checkedCount = 0;

  const total = items.length;

  const worker = async () => {
    while (currentIndex < items.length) {
      if (signal?.aborted) break;

      const idx = currentIndex++;
      const item = items[idx];

      const result = await checkVideoUrlWithHtml5Player(item.url, 25000, signal);

      if (signal?.aborted) break;

      if (result.valid) {
        validIds.push(item.id);
      } else {
        expiredIds.push(item.id);
      }

      checkedCount++;
      if (onProgress) {
        onProgress({
          total,
          checked: checkedCount,
          expiredCount: expiredIds.length,
        });
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);

  return { expiredIds, validIds };
}
