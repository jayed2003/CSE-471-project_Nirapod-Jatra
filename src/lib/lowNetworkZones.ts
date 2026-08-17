import { cacheValue, readCachedValue } from "@/lib/offline";

export type CachedZonePack = {
  zoneName: string;
  region: string;
  personalContacts: Array<{ name: string; phone: string; email: string; priority: number }>;
  nearbyServices: Array<{ id: string; name: string; category: string; point: [number, number]; distanceMeters: number; phones: string[] }>;
  degraded: boolean;
  tiles: string[];
  cachedAt: string;
};

function zoneKey(tripId: string, zoneId: string) {
  return `zone-pack:${tripId}:${zoneId}`;
}

function indexKey(tripId: string) {
  return `zone-pack-index:${tripId}`;
}

export async function writeZonePack(tripId: string, zoneId: string, pack: CachedZonePack) {
  await cacheValue(zoneKey(tripId, zoneId), pack);
  const existing = (await readCachedValue<string[]>(indexKey(tripId))) ?? [];
  if (!existing.includes(zoneId)) await cacheValue(indexKey(tripId), [...existing, zoneId]);
}

export async function readZonePack(tripId: string, zoneId: string) {
  return readCachedValue<CachedZonePack>(zoneKey(tripId, zoneId));
}

export async function readZonePackIndex(tripId: string) {
  return (await readCachedValue<string[]>(indexKey(tripId))) ?? [];
}

export async function readAnyZonePack(tripId: string) {
  const ids = await readZonePackIndex(tripId);
  for (const zoneId of ids) {
    const pack = await readZonePack(tripId, zoneId);
    if (pack) return pack;
  }
  return null;
}
