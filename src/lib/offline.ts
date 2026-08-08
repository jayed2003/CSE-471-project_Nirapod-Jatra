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