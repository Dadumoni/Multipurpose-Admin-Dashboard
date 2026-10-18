/**
 * Background HTML5 Video Player Verification Utility
 * Checks video URLs in a background browser context using native HTML5 video element.
 * 
 * Requirements:
 * - Browser header no-referrer set so IP/domain is not leaked and domain-restricted videos play properly.
 * - Opens 720p link first, and if that fails (e.g. 404), tests 480p link.
 * - If HTML5 player opens and can play/stream (loadeddata, canplay, readyState >= 2) -> Link is OK.
 * - If 404 or media decode/network error on all candidate links -> Link is expired.
 */

export interface VideoCheckResult {
  valid: boolean;
  error?: string;
  testedUrl?: string;
}

export interface VideoPostToCheck {
  id: number | string;
  _id?: string;
  link_720p?: string | null;
  link_480p?: string | null;
  video_url?: string | null;
  all_links?: string[];
  is_expired?: boolean;
  title?: string;
}

export interface BatchCheckProgress {
  total: number;
  checked: number;
  expiredCount: number;
  recoveredCount: number;
  activeCount: number;
}

/**
 * Checks a single video URL using an offscreen HTML5 video player in background browser context.
 * Enforces 'no-referrer' policy so that domain restrictions and hotlinking protections are satisfied.
 */
export function checkVideoUrlWithHtml5Player(
  url: string,
  timeoutMs: number = 8000,
  signal?: AbortSignal
): Promise<VideoCheckResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ valid: false, error: 'Cancelled', testedUrl: url });
      return;
    }

    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      resolve({ valid: false, error: 'Invalid or missing URL', testedUrl: url });
      return;
    }

    const cleanUrl = url.trim();

    // Create an offscreen HTML5 video element attached to the document
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('referrerpolicy', 'no-referrer');
    (video as any).referrerPolicy = 'no-referrer';
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
      finish({ valid: false, error: 'Cancelled', testedUrl: cleanUrl });
    };

    // HTML5 Player playback started successfully -> Link is OK
    const onPlaying = () => {
      finish({ valid: true, testedUrl: cleanUrl });
    };

    // Video frames are advancing or readyState >= 2 -> Link is OK
    const onTimeUpdate = () => {
      if (video.currentTime > 0 || video.readyState >= 2) {
        finish({ valid: true, testedUrl: cleanUrl });
      }
    };

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            finish({ valid: true, testedUrl: cleanUrl });
          })
          .catch((err) => {
            // Autoplay policies may block play(), but if readyState >= 2 or video dimensions are parsed, the stream is valid!
            if (video.readyState >= 2 || video.videoWidth > 0 || video.duration > 0) {
              finish({ valid: true, testedUrl: cleanUrl });
            } else if (err.name === 'NotSupportedError') {
              finish({ valid: false, error: err.message || 'Media format not supported', testedUrl: cleanUrl });
            }
          });
      }
    };

    const onCanPlay = () => {
      tryPlay();
    };

    const onLoadedData = () => {
      tryPlay();
    };

    // 404, network connection dropped, or media source error
    const onError = () => {
      const mediaErr = video.error;
      const errorMsg = mediaErr
        ? `Code ${mediaErr.code}: ${mediaErr.message || 'Media loading failed / 404'}`
        : 'Failed to load video (404/network error)';
      finish({ valid: false, error: errorMsg, testedUrl: cleanUrl });
    };

    // Progress updates as bytes buffer
    const onProgress = () => {
      lastProgressTimestamp = Date.now();
      if (video.readyState >= 2 || video.duration > 0) {
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
      video.src = cleanUrl;
      video.load();
    } catch (err: any) {
      finish({ valid: false, error: err?.message || 'Error initializing player', testedUrl: cleanUrl });
      return;
    }

    // Timeout watcher: if idle and no data buffered, considers it timed out / dead link
    const checkTimeout = () => {
      if (isSettled) return;
      const idleTime = Date.now() - lastProgressTimestamp;
      if (idleTime >= timeoutMs) {
        if (video.readyState >= 2 || video.videoWidth > 0 || video.duration > 0) {
          finish({ valid: true, testedUrl: cleanUrl });
        } else {
          finish({ valid: false, error: 'Video stream loading timed out / unreachable', testedUrl: cleanUrl });
        }
      } else {
        const remaining = Math.max(1000, timeoutMs - idleTime);
        timer = setTimeout(checkTimeout, remaining);
      }
    };

    timer = setTimeout(checkTimeout, timeoutMs);
  });
}

/**
 * Checks both 720p and 480p links for a given post in background browser:
 * 1. Opens 720p link in offscreen HTML5 player with no-referrer
 * 2. If valid, returns { valid: true } immediately
 * 3. If 720p fails (404 or media error), then tests 480p link
 * 4. If 480p link opens and plays, returns { valid: true }
 * 5. If all available stream links return 404 / fail, marks as expired
 */
export async function checkPostVideoLinksWithHtml5Player(
  post: VideoPostToCheck,
  timeoutMs: number = 8000,
  signal?: AbortSignal
): Promise<VideoCheckResult> {
  const candidateUrls: string[] = [];

  if (post.link_720p && typeof post.link_720p === 'string' && post.link_720p.startsWith('http')) {
    candidateUrls.push(post.link_720p.trim());
  }
  if (post.link_480p && typeof post.link_480p === 'string' && post.link_480p.startsWith('http')) {
    const clean480 = post.link_480p.trim();
    if (!candidateUrls.includes(clean480)) {
      candidateUrls.push(clean480);
    }
  }
  if (post.video_url && typeof post.video_url === 'string' && post.video_url.startsWith('http')) {
    const cleanUrl = post.video_url.trim();
    if (!candidateUrls.includes(cleanUrl)) {
      candidateUrls.push(cleanUrl);
    }
  }
  if (Array.isArray(post.all_links)) {
    for (const link of post.all_links) {
      if (link && typeof link === 'string' && link.startsWith('http')) {
        const cleanL = link.trim();
        if (!candidateUrls.includes(cleanL)) {
          candidateUrls.push(cleanL);
        }
      }
    }
  }

  if (candidateUrls.length === 0) {
    return { valid: false, error: 'No stream URLs found' };
  }

  let lastError = '';
  for (const streamUrl of candidateUrls) {
    if (signal?.aborted) {
      return { valid: false, error: 'Cancelled' };
    }
    const res = await checkVideoUrlWithHtml5Player(streamUrl, timeoutMs, signal);
    if (res.valid) {
      return { valid: true, testedUrl: streamUrl };
    }
    lastError = res.error || 'Failed to open in HTML5 player';
  }

  return { valid: false, error: lastError };
}

/**
 * Runs background video player checks with controlled concurrency across posts.
 * As batches are checked, reports verified results to database in real-time.
 */
export async function batchCheckPostVideoLinks(
  posts: VideoPostToCheck[],
  concurrency: number = 4,
  onProgress?: (progress: BatchCheckProgress) => void,
  onBatchVerified?: (batch: { expiredIds: (number | string)[]; validIds: (number | string)[] }) => Promise<void>,
  signal?: AbortSignal
): Promise<{
  expiredIds: (number | string)[];
  validIds: (number | string)[];
  recoveredCount: number;
  newlyExpiredCount: number;
}> {
  const expiredIds: (number | string)[] = [];
  const validIds: (number | string)[] = [];
  let recoveredCount = 0;
  let newlyExpiredCount = 0;

  let currentIndex = 0;
  let checkedCount = 0;
  const total = posts.length;

  let pendingBatch: { expiredIds: (number | string)[]; validIds: (number | string)[] } = {
    expiredIds: [],
    validIds: [],
  };

  const flushBatch = async () => {
    if (pendingBatch.expiredIds.length === 0 && pendingBatch.validIds.length === 0) return;
    const current = {
      expiredIds: [...pendingBatch.expiredIds],
      validIds: [...pendingBatch.validIds],
    };
    pendingBatch = { expiredIds: [], validIds: [] };
    if (onBatchVerified) {
      try {
        await onBatchVerified(current);
      } catch (err) {
        console.warn('Failed to sync verified batch with database:', err);
      }
    }
  };

  const worker = async () => {
    while (currentIndex < posts.length) {
      if (signal?.aborted) break;

      const idx = currentIndex++;
      const post = posts[idx];

      const res = await checkPostVideoLinksWithHtml5Player(post, 8000, signal);
      if (signal?.aborted) break;

      const targetId = post.id !== undefined && post.id !== null ? post.id : (post._id || '');
      if (res.valid) {
        validIds.push(targetId);
        pendingBatch.validIds.push(targetId);
        if (post.is_expired) recoveredCount++;
      } else {
        expiredIds.push(targetId);
        pendingBatch.expiredIds.push(targetId);
        if (!post.is_expired) newlyExpiredCount++;
      }

      checkedCount++;
      if (onProgress) {
        onProgress({
          total,
          checked: checkedCount,
          expiredCount: expiredIds.length,
          recoveredCount,
          activeCount: validIds.length,
        });
      }

      // Flush batch to database every 10 verified items
      if (pendingBatch.expiredIds.length + pendingBatch.validIds.length >= 10) {
        await flushBatch();
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, Math.max(1, posts.length)) }, () => worker());
  await Promise.all(pool);
  await flushBatch();

  return { expiredIds, validIds, recoveredCount, newlyExpiredCount };
}
