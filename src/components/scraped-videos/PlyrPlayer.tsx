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

  return (
    <div
      key={sourcesKey}
      className="plyr-contain-player w-full aspect-video bg-black rounded-xl overflow-hidden relative flex items-center justify-center shadow-inner shrink-0"
    >
      <video
        ref={videoRef}
        playsInline
        preload="auto"
        poster={poster || undefined}
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
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className="h-full w-full flex items-center justify-center text-zinc-400 dark:text-zinc-500">
        {fallbackIcon || <FileVideo className="h-6 w-6" />}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-800 animate-pulse flex items-center justify-center z-0">
          <Film className="h-5 w-5 text-zinc-300 dark:text-zinc-700 animate-pulse" />
        </div>
      )}
      <img
        src={src}
        alt={alt || ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
        className={`${className || ''} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
