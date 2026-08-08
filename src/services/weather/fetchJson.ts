const TIMEOUT_MS = 10_000;

export async function fetchJson<T>(url: string, init?: RequestInit, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
  }
  throw new Error(`Data provider unavailable: ${lastError instanceof Error ? lastError.message : "network error"}`);
}

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const CACHE_DURATION_MS = 10 * 60 * 1000;

export async function cached<T>(namespace: string, latitude: number, longitude: number, loader: () => Promise<T>): Promise<T> {
  const key = `${namespace}:${latitude},${longitude}`;
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) return running;
  const request = loader().then((value) => { cache.set(key, { value, expiresAt: Date.now() + CACHE_DURATION_MS }); return value; }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function clearWeatherCache() { cache.clear(); pending.clear(); }