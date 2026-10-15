import React, { useEffect, useState, useMemo, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { Film, FileVideo } from 'lucide-react';
import { PlyrSourceOption } from './types';

export function PlyrPlayer({
  src,
  poster,
  sources,
  onQualityChange,
}: {
  src: string;
  poster?: string | null;
  sources?: PlyrSourceOption[];
  onQualityChange?: (newUrl: string, size: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const onQualityChangeRef = useRef(onQualityChange);
  onQualityChangeRef.current = onQualityChange;

  const normalizedSources = useMemo<PlyrSourceOption[]>(() => {
    if (sources && sources.length >= 2) {
      return sources;
    }
    const baseSrc = (sources && sources[0]?.src) || src;
    return [
      { src: baseSrc, size: 720 },
      { src: baseSrc, size: 480 },
    ];
  }, [sources, src]);

  const sourcesKey = useMemo(
    () => normalizedSources.map((s) => `${s.size}:${s.src}`).join('|'),
    [normalizedSources]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const qualitySizes = normalizedSources.map((s) => s.size);
    const activeMatch = normalizedSources.find((s) => s.src === src) || normalizedSources[0];
    const defaultQuality = activeMatch ? activeMatch.size : (qualitySizes[0] || 720);

    let player: Plyr | null = null;
    try {
      player = new Plyr(video, {
        ratio: '16:9',
        controls: [
          'play-large',
          'play',
          'progress',
          'current-time',
          'duration',
          'mute',
          'captions',
          'settings',
          'pip',
          'airplay',
          'fullscreen',
        ],
        settings: ['quality', 'speed', 'loop'],
        quality: {
          default: defaultQuality,
          options: [1080, 720, 480, 360],
        },
        i18n: {
          qualityBadge: {
            2160: '4K',
            1440: 'HD',
            1080: 'HD',
            720: 'HD',
            576: 'SD',
            480: 'SD',
          },
        },
        hideControls: false,
        autoplay: false,
        loadSprite: true,
        iconUrl: '/plyr.svg',
        resetOnEnd: true,
        seekTime: 10,
      });

      player.on('qualitychange', (event: any) => {
        const newSize = Number(event?.detail?.plyr?.quality || player?.quality);
        const matched = normalizedSources.find((s) => s.size === newSize);
        if (matched && onQualityChangeRef.current) {
          onQualityChangeRef.current(matched.src, newSize);
        }
      });

      // Stream proxy fallback if direct CDN fails (e.g. strict hotlink or CORS block)
      const handleVideoError = () => {
        const failedUrl = video.currentSrc || src;
        if (!failedUrl || failedUrl.includes('/api/stream-proxy')) return;
        console.warn(`[Plyr] Direct playback error for "${failedUrl}". Switching to /api/stream-proxy fallback.`);
        const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(failedUrl)}`;
        try {
          if (player) {
            player.source = {
              type: 'video',
              sources: [
                {
                  src: proxyUrl,
                  type: 'video/mp4',
                  size: player.quality || defaultQuality,
                },
              ],
              poster: poster || undefined,
            };
            const playPromise = player.play();
            if (playPromise && typeof (playPromise as any).catch === 'function') {
              (playPromise as any).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('[Plyr] Error updating source to stream proxy:', err);
        }
      };

      video.addEventListener('error', handleVideoError);

      playerRef.current = player;
    } catch (e) {
      console.warn('Plyr init:', e);
    }

    return () => {
      if (player) {
        try {
          player.destroy();
        } catch {}
      }
      if (playerRef.current === player) {
        playerRef.current = null;
      }
    };
  }, [sourcesKey]);

  useEffect(() => {
    if (!playerRef.current) return;
    const match = normalizedSources.find((s) => s.src === src);
    if (match && playerRef.current.quality !== match.size) {
      try {
        playerRef.current.quality = match.size;
      } catch {}
    }
  }, [src, normalizedSources]);

  const optimizedPoster = useMemo(() => {
    if (!poster) return undefined;
    if (poster.startsWith('data:') || poster.startsWith('blob:') || poster.includes('/api/image-optimizer')) {
      return poster;
    }
    return `/api/image-optimizer?url=${encodeURIComponent(poster)}&w=800&q=80&format=webp`;
  }, [poster]);

  return (
    <div
      key={sourcesKey}
      className="plyr-contain-player w-full aspect-video bg-black rounded-xl overflow-hidden relative flex items-center justify-center shadow-inner shrink-0"
    >
      <video
        ref={videoRef}
        playsInline
        preload="auto"
        poster={optimizedPoster}
        {...({ referrerPolicy: 'no-referrer' } as any)}
        className="h-full w-full object-contain"
        style={{ objectFit: 'contain' }}
      >
        {normalizedSources.map((s) => (
          <source key={s.size} src={s.src} type="video/mp4" {...({ size: s.size, referrerPolicy: 'no-referrer' } as any)} />
        ))}
      </video>
    </div>
  );
}

export function LazyThumbnail({
  src,
  alt,
  className,
  fallbackIcon,
  priority = false,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [src]);

  // True IntersectionObserver for viewport-based lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const el = containerRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '250px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [priority, isInView]);

  if (!src || hasError) {
    return (
      <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500">
        {fallbackIcon || <FileVideo className="h-6 w-6 opacity-60" />}
      </div>
    );
  }

  // Optimize image URL on-the-fly to compressed WebP (Cloudflare R2 or external CDN images)
  const optimizedSrc = (() => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:') || src.includes('/api/image-optimizer')) {
      return src;
    }
    return `/api/image-optimizer?url=${encodeURIComponent(src)}&w=480&q=75&format=webp`;
  })();

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
      {/* Animated Shimmering Skeleton Placeholder */}
      {!loaded && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900 bg-[length:200%_100%] animate-pulse flex items-center justify-center">
          <Film className="h-5 w-5 text-zinc-300 dark:text-zinc-700 animate-pulse" />
        </div>
      )}

      {isInView && (
        <img
          src={optimizedSrc}
          alt={alt || ''}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...({ fetchPriority: priority ? 'high' : 'low' } as any)}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // If optimizer URL fails, retry with raw source directly as fallback
            if (optimizedSrc !== src) {
              const testImg = new Image();
              testImg.onload = () => setLoaded(true);
              testImg.onerror = () => setHasError(true);
              testImg.src = src;
            } else {
              setHasError(true);
            }
          }}
          className={`${className || ''} ${
            loaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-95 blur-xs'
          } transition-all duration-300 ease-out`}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
