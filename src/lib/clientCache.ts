/**
 * Client-Side Cache Helper (In-Memory Map + sessionStorage / localStorage fallback)
 * Prevents redundant database requests when switching between sidebar menus.
 * Uses an in-memory Map first so large datasets (e.g., 9,300+ MongoDB posts) never fail
 * due to the 5MB browser storage quota limit.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEnvelope<T> {
  timestamp: number;
  data: T;
}

const memoryCache = new Map<string, CacheEnvelope<any>>();

/**
 * Read item from in-memory cache first, then fallback to sessionStorage / localStorage
 */
export function getClientCache<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): T | null {
  try {
    // 1. Fast in-memory check (supports unlimited dataset size, 0ms latency)
    const memItem = memoryCache.get(key);
    if (memItem && typeof memItem.timestamp === 'number') {
      const age = Date.now() - memItem.timestamp;
      if (age <= maxAgeMs) {
        return memItem.data as T;
      }
      memoryCache.delete(key);
    }

    if (typeof window === 'undefined') return null;

    // 2. Fallback to sessionStorage / localStorage
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return null;

    const parsed: CacheEnvelope<T> = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== 'number') return null;

    const age = Date.now() - parsed.timestamp;
    if (age > maxAgeMs) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return null;
    }

    // Hydrate in-memory cache for subsequent instant reads
    memoryCache.set(key, parsed);
    return parsed.data;
  } catch (err) {
    console.warn(`[ClientCache] Error reading cache key "${key}":`, err);
    return null;
  }
}

/**
 * Write item to in-memory cache (primary) and sessionStorage/localStorage (if within quota)
 */
export function setClientCache<T>(key: string, data: T): void {
  const envelope: CacheEnvelope<T> = {
    timestamp: Date.now(),
    data,
  };

  // Always store in memory so large lists (e.g. 9,300+ posts) are cached across menu navigation
  memoryCache.set(key, envelope);

  try {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(envelope);
    // Only write to browser storage if under ~3.5 MB to avoid QuotaExceededError
    if (serialized.length < 3_500_000) {
      sessionStorage.setItem(key, serialized);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // Quota limit safety
      }
    }
  } catch {
    // In-memory cache already holds the data safely
  }
}

/**
 * Invalidate a specific cache key
 */
export function invalidateClientCache(key: string): void {
  memoryCache.delete(key);
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[ClientCache] Error invalidating key "${key}":`, err);
  }
}

/**
 * Invalidate all cache keys matching a prefix or pattern (e.g. 'posts:', 'overview:')
 */
export function invalidateClientCachePattern(prefix: string): void {
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(prefix)) {
      memoryCache.delete(k);
    }
  }

  try {
    if (typeof window === 'undefined') return;

    const sessionKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) sessionKeys.push(k);
    }
    sessionKeys.forEach((k) => sessionStorage.removeItem(k));

    const localKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localKeys.push(k);
    }
    localKeys.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn(`[ClientCache] Error invalidating pattern "${prefix}":`, err);
  }
}

/**
 * Invalidate all video data caches (posts, overview, uploaded videos)
 */
export function clearAllVideoCaches(): void {
  invalidateClientCachePattern('posts:');
  invalidateClientCachePattern('overview:');
  invalidateClientCache('uploaded_videos:list');
  invalidateClientCache('posts_expired_count');
  invalidateClientCache('storage_stats');
}
