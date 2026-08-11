import { openDB } from "idb";

const CACHE_NAME = "waymark-offline";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
type CachedValue<T> = { value: T; savedAt: number };

async function database() {
  return openDB(CACHE_NAME, 1, { upgrade(db) { db.createObjectStore("values"); } });
}

export async function cacheValue<T>(key: string, value: T) {
  const db = await database();
  await db.put("values", { value, savedAt: Date.now() } satisfies CachedValue<T>, key);
}

export async function readCachedValue<T>(key: string): Promise<T | null> {
  const db = await database();
  const cached = await db.get("values", key) as CachedValue<T> | undefined;
  if (!cached || Date.now() - cached.savedAt > MAX_AGE_MS) return null;
  return cached.value;
}

export async function cleanupExpiredCache() {
  const db = await database();
  let cursor = await db.transaction("values", "readwrite").store.openCursor();
  while (cursor) {
    if (Date.now() - (cursor.value as CachedValue<unknown>).savedAt > MAX_AGE_MS) await cursor.delete();
    cursor = await cursor.continue();
  }
}

const TILE_CACHE = "offline-map-tiles";

export async function primeOfflineMap(urls: string[], onProgress?: (loaded: number, total: number) => void) {
  const cache = await caches.open(TILE_CACHE);
  let loaded = 0;
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) {
        const response = await fetch(url, { mode: "no-cors" });
        if (response) await cache.put(url, response);
      }
    } catch { }
    loaded += 1;
    onProgress?.(loaded, urls.length);
  }
  return loaded;
}

export async function countCachedTiles(urls: string[]) {
  const cache = await caches.open(TILE_CACHE);
  let count = 0;
  for (const url of urls) if (await cache.match(url)) count += 1;
  return count;
}