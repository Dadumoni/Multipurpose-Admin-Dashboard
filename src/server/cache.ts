import NodeCache from 'node-cache';

// In-memory cache with standard TTL of 60 seconds and auto-cleanup check every 120 seconds
const cache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
  useClones: false,
});

export function cacheGet<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function cacheSet<T>(key: string, value: T, ttlSeconds?: number): boolean {
  if (ttlSeconds !== undefined) {
    return cache.set(key, value, ttlSeconds);
  }
  return cache.set(key, value);
}

export function cacheDel(key: string): number {
  return cache.del(key);
}

export function invalidatePostsCache(): void {
  const keys = cache.keys();
  const keysToDelete = keys.filter(
    (k) =>
      k.startsWith('posts:') ||
      k.startsWith('dashboard:') ||
      k.startsWith('expired:')
  );
  if (keysToDelete.length > 0) {
    cache.del(keysToDelete);
  }
}

export function clearAllCache(): void {
  cache.flushAll();
}

export default cache;
