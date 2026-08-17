export type BmdAlert = {
  provider: "bmd";
  id: string;
  event: string;
  severity: string;
  headline: string;
  instruction?: string;
  area: string;
  effective: string;
  expires: string;
  polygons: Array<Array<[number, number]>>;
};

export type FloodWarning = {
  provider: "bwdb";
  stationId: string;
  station: string;
  district: string;
  point: [number, number];
  levelM?: number;
  dangerLevelM?: number;
  status: "None" | "Watch" | "Warning";
  headline: string;
  source: "ffwc" | "fallback" | "demo";
};

export type RouteWarning = {
  provider: "bmd" | "bwdb";
  event: string;
  severity: string;
  status: "None" | "Watch" | "Warning";
  headline: string;
  area?: string;
  expires?: string;
  distanceKm: number;
  matchedAt: [number, number];
  polygon?: Array<[number, number]>;
};

export type NearestShelter = { name: string; point: [number, number]; distanceKm: number; source: "overpass" | "fallback" };

export type ReadinessReport = {
  status: "ready" | "escalated";
  source: "bmd" | "bwdb" | "bmd+bwdb" | null;
  warnings: RouteWarning[];
  nearestShelter: NearestShelter | null;
  offlineMap: { zoom: number; tileCount: number; tiles: string[] };
  checkedAt: string;
};

const BMD_FEED = "https://cap.bmd.gov.bd/api/cap/rss.xml";
const FLOOD_CORRIDOR_KM = 25;
const SEVERITY_LEVEL: Record<string, "None" | "Watch" | "Warning"> = { Minor: "Watch", Moderate: "Watch", Severe: "Warning", Extreme: "Warning" };

function tags(xml: string, tag: string) {
  const matches: string[] = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) matches.push(match[1]);
  return matches;
}

function firstTag(xml: string, tag: string) { return tags(xml, tag)[0]?.trim() ?? ""; }

function parsePolygons(xml: string) {
  return tags(xml, "cap:polygon").map((polygon) => polygon.trim().split(/\s+/).map((pair) => { const [lat, lng] = pair.split(",").map(Number); return [lng, lat] as [number, number]; }).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
}

function parseRssItems(xml: string) {
  return tags(xml, "item").map((item) => ({ title: firstTag(item, "title"), link: firstTag(item, "link") }));
}

export function pointInPolygon(longitude: number, latitude: number, polygon: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = (yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const radiusKm = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const sine = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(sine), Math.sqrt(1 - sine));
}

export async function fetchBmdAlerts(): Promise<BmdAlert[]> {
  try {
    const feedResponse = await fetch(BMD_FEED, { signal: AbortSignal.timeout(10_000) });
    if (!feedResponse.ok) return [];
    const feedXml = await feedResponse.text();
    const items = parseRssItems(feedXml);
    const alerts: BmdAlert[] = [];
    await Promise.all(items.slice(0, 12).map(async (item) => {
      if (!item.link) return;
      try {
        const alertResponse = await fetch(item.link, { signal: AbortSignal.timeout(10_000) });
        if (!alertResponse.ok) return;
        const xml = await alertResponse.text();
        const status = firstTag(xml, "cap:status").toLowerCase();
        const messageType = firstTag(xml, "cap:msgType").toLowerCase();
        if (status !== "actual" || messageType === "cancel") return;
        const expiresValue = firstTag(xml, "cap:expires");
        const expires = new Date(expiresValue);
        if (Number.isFinite(expires.getTime()) && expires.getTime() < Date.now()) return;
        alerts.push({ provider: "bmd", id: firstTag(xml, "cap:identifier") || item.link, event: firstTag(xml, "cap:event"), severity: firstTag(xml, "cap:severity"), headline: firstTag(xml, "cap:headline") || item.title, instruction: firstTag(xml, "cap:instruction"), area: firstTag(xml, "cap:areaDesc"), effective: firstTag(xml, "cap:effective"), expires: expiresValue, polygons: parsePolygons(xml) });
      } catch { return; }
    }));
    return alerts;
  } catch { return []; }
}

const FLOOD_STATIONS: Array<{ id: string; station: string; district: string; point: [number, number]; dangerLevelM: number }> = [
  { id: "SW1", station: "Kurigram", district: "Kurigram", point: [89.65, 25.8], dangerLevelM: 25.5 },
  { id: "SW2", station: "Chilmari", district: "Kurigram", point: [89.68, 25.2], dangerLevelM: 20.0 },
  { id: "SW18", station: "Bahadurabad", district: "Jamalpur", point: [89.66, 24.95], dangerLevelM: 19.5 },
  { id: "SW20", station: "Sirajganj", district: "Sirajganj", point: [89.7, 24.45], dangerLevelM: 13.6 },
  { id: "SW23", station: "Aricha", district: "Manikganj", point: [89.75, 23.85], dangerLevelM: 9.75 },
  { id: "SW45", station: "Bhagyakul", district: "Munshiganj", point: [90.1, 23.62], dangerLevelM: 5.5 },
  { id: "SW48", station: "Goalundo Ghat", district: "Rajbari", point: [89.78, 23.73], dangerLevelM: 8.7 },
  { id: "SW90", station: "Bhairab Bazar", district: "Kishoreganj", point: [90.98, 24.05], dangerLevelM: 6.25 },
  { id: "SW93", station: "Chandpur", district: "Chandpur", point: [90.66, 23.23], dangerLevelM: 6.0 },
  { id: "SW268", station: "Sylhet", district: "Sylhet", point: [91.87, 24.9], dangerLevelM: 10.5 },
  { id: "SW272", station: "Sunamganj", district: "Sunamganj", point: [91.4, 25.07], dangerLevelM: 8.25 },
];

function curatedFloodWarnings(): FloodWarning[] {
  const demo = (process.env.DEMO_FLOOD_STATIONS ?? "").split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
  return FLOOD_STATIONS.map((station) => {
    const demoActive = demo.includes(station.id.toLowerCase());
    const status: "None" | "Watch" | "Warning" = demoActive ? "Warning" : "None";
    const levelM = status === "Warning" ? station.dangerLevelM + 0.8 : station.dangerLevelM - 0.6;
    return { provider: "bwdb", stationId: station.id, station: station.station, district: station.district, point: station.point, levelM, dangerLevelM: station.dangerLevelM, status, headline: demoActive ? `${station.station} river gauge is above the danger level (${levelM.toFixed(2)} m).` : "River level is below the danger level.", source: demoActive ? "demo" : "fallback" };
  });
}

async function ffwcFloodWarnings(): Promise<FloodWarning[] | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`https://api.ffwc.gov.bd/data_load/observed-waterlevel-by-station-and-date/10/${today}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const body = await response.json() as unknown;
    const records = Array.isArray(body) ? body as Array<Record<string, unknown>> : [];
    if (!records.length) return null;
    return records.map((record) => {
      const latitude = Number(record.latitude ?? record.lat);
      const longitude = Number(record.longitude ?? record.lon);
      const dangerLevelM = Number(record.danger_level ?? record.dangerLevel);
      const levelM = Number(record.water_level ?? record.level);
      return { provider: "bwdb", stationId: String(record.station_id ?? record.stationId ?? ""), station: String(record.station_name ?? record.station ?? "Gauge"), district: String(record.district ?? ""), point: [longitude, latitude] as [number, number], levelM, dangerLevelM, status: levelM > dangerLevelM ? "Warning" : levelM > dangerLevelM - 1 ? "Watch" : "None", headline: `${String(record.station_name ?? record.station ?? "Gauge")} river gauge reading`, source: "ffwc" as const };
    });
  } catch { return null; }
}

export async function fetchFloodWarnings(): Promise<FloodWarning[]> {
  const live = await ffwcFloodWarnings();
  return live ?? curatedFloodWarnings();
}

export function routePoints(geometry: unknown): Array<[number, number]> {
  const coordinates = (geometry as { coordinates?: unknown } | null | undefined)?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  const points: Array<[number, number]> = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = point[0];
    const lat = point[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
  }
  return points;
}

function sampleRoute(points: Array<[number, number]>, max = 80) {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, index) => points[Math.floor(index * step)]);
}

export function boundsOf(points: Array<[number, number]>) {
  const bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
  for (const [lng, lat] of points) {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  }
  return bounds;
}

export function warningsNearRoute(geometry: unknown, alerts: BmdAlert[], floods: FloodWarning[], corridorKm = FLOOD_CORRIDOR_KM): RouteWarning[] {
  const points = sampleRoute(routePoints(geometry));
  if (!points.length) return [];
  const bounds = boundsOf(points);
  const warnings: RouteWarning[] = [];
  for (const alert of alerts) {
    for (const polygon of alert.polygons) {
      if (!polygon.length) continue;
      const polygonBounds = boundsOf(polygon);
      if (polygonBounds.maxLng < bounds.minLng || polygonBounds.minLng > bounds.maxLng || polygonBounds.maxLat < bounds.minLat || polygonBounds.minLat > bounds.maxLat) continue;
      const matched = points.find(([lng, lat]) => pointInPolygon(lng, lat, polygon));
      if (matched) { warnings.push({ provider: "bmd", event: alert.event, severity: alert.severity, status: SEVERITY_LEVEL[alert.severity] ?? "Watch", headline: alert.headline, area: alert.area, expires: alert.expires, distanceKm: 0, matchedAt: matched, polygon }); break; }
    }
  }
  for (const flood of floods) {
    if (flood.status === "None") continue;
    let nearest: { point: [number, number]; distanceKm: number } | null = null;
    for (const point of points) {
      const distanceKm = haversineKm(point, flood.point);
      if (!nearest || distanceKm < nearest.distanceKm) nearest = { point, distanceKm };
    }
    if (nearest && nearest.distanceKm <= corridorKm) warnings.push({ provider: "bwdb", event: "Flood", severity: flood.status === "Warning" ? "Severe" : "Moderate", status: flood.status, headline: flood.headline, area: `${flood.station}, ${flood.district}`, distanceKm: Math.round(nearest.distanceKm * 10) / 10, matchedAt: flood.point });
  }
  return warnings;
}

const OVERPASS_INSTANCES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const CURATED_SHELTERS: Array<{ name: string; point: [number, number] }> = [
  { name: "Dhaka Cyclone Shelter (Motijheel)", point: [90.4219, 23.7274] },
  { name: "Dhaka Cyclone Shelter (Uttara)", point: [90.395, 23.875] },
  { name: "Sylhet City Shelter", point: [91.87, 24.9] },
  { name: "Comilla Shelter", point: [91.19, 23.46] },
  { name: "Chittagong City Shelter", point: [91.83, 22.35] },
  { name: "Cox's Bazar Shelter", point: [91.98, 21.43] },
  { name: "Khulna City Shelter", point: [89.56, 22.82] },
  { name: "Barishal City Shelter", point: [90.37, 22.7] },
  { name: "Rajshahi City Shelter", point: [88.6, 24.37] },
  { name: "Rangpur City Shelter", point: [89.25, 25.75] },
  { name: "Mymensingh City Shelter", point: [90.41, 24.75] },
  { name: "Chandpur Shelter", point: [90.66, 23.23] },
  { name: "Bhairab Bazar Shelter", point: [90.98, 24.05] },
  { name: "Sirajganj Shelter", point: [89.7, 24.45] },
  { name: "Faridpur Shelter", point: [89.84, 23.6] },
];

function nearestCuratedShelter(points: Array<[number, number]>): NearestShelter | null {
  let nearest: NearestShelter | null = null;
  for (const shelter of CURATED_SHELTERS) {
    let best = Infinity;
    for (const point of points) best = Math.min(best, haversineKm(point, shelter.point));
    if (!nearest || best < nearest.distanceKm) nearest = { name: shelter.name, point: shelter.point, distanceKm: Math.round(best * 10) / 10, source: "fallback" };
  }
  return nearest;
}

export async function nearestShelter(geometry: unknown): Promise<NearestShelter | null> {
  const points = sampleRoute(routePoints(geometry));
  if (!points.length) return null;
  const bounds = boundsOf(points);
  const buffer = 0.08;
  const south = Math.max(-85, bounds.minLat - buffer);
  const north = Math.min(85, bounds.maxLat + buffer);
  const west = Math.max(-180, bounds.minLng - buffer);
  const east = Math.min(180, bounds.maxLng + buffer);
  const query = `[out:json];nwr[amenity=shelter](${south},${west},${north},${east});out center;`;
  const overpassDeadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000));
  const overpassAttempt = (async () => {
    for (const instance of OVERPASS_INSTANCES) {
      try {
        const upstream = await fetch(instance, { method: "POST", headers: { "content-type": "text/plain", "user-agent": "WaymarkSafety/1.0 (local development)" }, body: query, signal: AbortSignal.timeout(5_000) });
        if (!upstream.ok) continue;
        const body = await upstream.json() as { elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }> };
        let nearest: NearestShelter | null = null;
        for (const element of body.elements) {
          const latitude = element.lat ?? element.center?.lat;
          const longitude = element.lon ?? element.center?.lon;
          if (latitude === undefined || longitude === undefined) continue;
          let best = Infinity;
          for (const point of points) best = Math.min(best, haversineKm(point, [longitude, latitude]));
          if (!nearest || best < nearest.distanceKm) nearest = { name: element.tags?.name ?? "Nearest shelter", point: [longitude, latitude], distanceKm: Math.round(best * 10) / 10, source: "overpass" };
        }
        if (nearest) return nearest;
      } catch { continue; }
    }
    return null;
  })();
  const overpass = await Promise.race([overpassAttempt, overpassDeadline]);
  return overpass ?? nearestCuratedShelter(points);
}

export type NearestGauge = { name: string; district: string; point: [number, number]; distanceKm: number; status: FloodWarning["status"] };

export async function nearestFloodGauge(point: [number, number]): Promise<NearestGauge | null> {
  const floods = await fetchFloodWarnings();
  let nearest: NearestGauge | null = null;
  for (const flood of floods) {
    const distanceKm = haversineKm(point, flood.point);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { name: flood.station, district: flood.district, point: flood.point, distanceKm: Math.round(distanceKm * 10) / 10, status: flood.status };
  }
  return nearest;
}

const CURATED_HOSPITALS: Array<{ name: string; point: [number, number] }> = [
  { name: "Dhaka Medical College Hospital", point: [90.3981, 23.7266] },
  { name: "Square Hospital, Dhaka", point: [90.3884, 23.7513] },
  { name: "Sylhet MAG Osmani Medical College Hospital", point: [91.874, 24.891] },
  { name: "Chittagong Medical College Hospital", point: [91.8341, 22.3411] },
  { name: "Cox's Bazar Sadar Hospital", point: [92.002, 21.434] },
  { name: "Khulna Medical College Hospital", point: [89.54, 22.809] },
  { name: "Sher-e-Bangla Medical College Hospital, Barishal", point: [90.375, 22.705] },
  { name: "Rajshahi Medical College Hospital", point: [88.595, 24.362] },
  { name: "Rangpur Medical College Hospital", point: [89.245, 25.749] },
  { name: "Mymensingh Medical College Hospital", point: [90.407, 24.753] },
  { name: "Comilla Medical College Hospital", point: [91.183, 23.469] },
  { name: "Sirajganj 250-bed General Hospital", point: [89.706, 24.457] },
];

function nearestCuratedHospital(point: [number, number]): { name: string; point: [number, number]; distanceKm: number } | null {
  let nearest: { name: string; point: [number, number]; distanceKm: number } | null = null;
  for (const hospital of CURATED_HOSPITALS) {
    const distanceKm = haversineKm(point, hospital.point);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { name: hospital.name, point: hospital.point, distanceKm: Math.round(distanceKm * 10) / 10 };
  }
  return nearest;
}

function looksLikeFacility(name: string) {
  return /\b(hospital|medical|clinic|health|care|nursing|diagnostic|sadar|shishu|chamber|infirmary|general|college)\b/i.test(name);
}

export async function nearestHospital(point: [number, number]): Promise<{ name: string; point: [number, number]; distanceKm: number } | null> {
  const [longitude, latitude] = point;
  const query = `[out:json];nwr[amenity=hospital](around:5000,${latitude},${longitude});out center;`;
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000));
  const attempt = (async () => {
    for (const instance of OVERPASS_INSTANCES) {
      try {
        const upstream = await fetch(instance, { method: "POST", headers: { "content-type": "text/plain", "user-agent": "WaymarkSafety/1.0 (local development)" }, body: query, signal: AbortSignal.timeout(5_000) });
        if (!upstream.ok) continue;
        const body = await upstream.json() as { elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }> };
        let nearest: { name: string; point: [number, number]; distanceKm: number } | null = null;
        let nearestFacility: { name: string; point: [number, number]; distanceKm: number } | null = null;
        for (const element of body.elements) {
          const latitudeValue = element.lat ?? element.center?.lat;
          const longitudeValue = element.lon ?? element.center?.lon;
          if (latitudeValue === undefined || longitudeValue === undefined) continue;
          const distanceKm = haversineKm(point, [longitudeValue, latitudeValue]);
          const name = element.tags?.name ?? "Nearest hospital";
          const candidate = { name, point: [longitudeValue, latitudeValue] as [number, number], distanceKm: Math.round(distanceKm * 10) / 10 };
          if (!nearest || distanceKm < nearest.distanceKm) nearest = candidate;
          if (looksLikeFacility(name) && (!nearestFacility || distanceKm < nearestFacility.distanceKm)) nearestFacility = candidate;
        }
        if (nearestFacility) return nearestFacility;
      } catch { continue; }
    }
    return null;
  })();
  return (await Promise.race([attempt, deadline])) ?? nearestCuratedHospital(point);
}

export type EmergencyServiceCategory = "hospital" | "fire" | "ambulance" | "police";

export type NearbyEmergencyService = {
  id: string;
  name: string;
  category: EmergencyServiceCategory;
  point: [number, number];
  distanceMeters: number;
  phones: string[];
};

function categorizeEmergencyTags(elementTags: Record<string, string>): EmergencyServiceCategory | null {
  if (elementTags.amenity === "hospital" || elementTags.amenity === "clinic" || elementTags.healthcare === "hospital" || elementTags.healthcare === "clinic") return "hospital";
  if (elementTags.amenity === "fire_station") return "fire";
  if (elementTags.emergency === "ambulance_station") return "ambulance";
  if (elementTags.amenity === "police") return "police";
  return null;
}

function extractPhones(elementTags: Record<string, string>): string[] {
  const raw = elementTags.phone ?? elementTags["contact:phone"] ?? elementTags["emergency:phone"] ?? elementTags.mobile ?? elementTags["contact:mobile"];
  if (!raw) return [];
  return raw.split(/[;,]/).map((value) => value.trim()).filter(Boolean);
}

const EMERGENCY_SERVICES_CACHE = new Map<string, { savedAt: number; services: NearbyEmergencyService[] }>();
const EMERGENCY_SERVICES_CACHE_MS = 3 * 60 * 1000;

export type NearbyEmergencyServicesResult = { services: NearbyEmergencyService[]; degraded: boolean };

export async function nearbyEmergencyServices(point: [number, number], radiusMeters = 400): Promise<NearbyEmergencyServicesResult> {
  const [longitude, latitude] = point;
  // Round to a ~110m grid so nearby repeat lookups (page reloads, refresh-location clicks) hit the cache
  // instead of re-querying the often-overloaded public Overpass mirrors every time.
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radiusMeters}`;
  const cached = EMERGENCY_SERVICES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < EMERGENCY_SERVICES_CACHE_MS) return { services: cached.services, degraded: false };

  const around = `around:${radiusMeters},${latitude},${longitude}`;
  const query = `[out:json][timeout:20];(nwr[amenity=hospital](${around});nwr[amenity=clinic](${around});nwr[healthcare=hospital](${around});nwr[amenity=fire_station](${around});nwr[emergency=ambulance_station](${around});nwr[amenity=police](${around}););out center tags;`;
  const perInstanceTimeoutMs = 20_000;
  const overallDeadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 22_000));

  const queryInstance = async (instance: string): Promise<NearbyEmergencyService[] | null> => {
    try {
      const upstream = await fetch(instance, { method: "POST", headers: { "content-type": "text/plain", "user-agent": "WaymarkSafety/1.0 (local development)" }, body: query, signal: AbortSignal.timeout(perInstanceTimeoutMs) });
      if (!upstream.ok) return null;
      const body = await upstream.json() as { elements: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
      const services: NearbyEmergencyService[] = [];
      for (const element of body.elements) {
        const elementTags = element.tags ?? {};
        const category = categorizeEmergencyTags(elementTags);
        if (!category) continue;
        const elementLatitude = element.lat ?? element.center?.lat;
        const elementLongitude = element.lon ?? element.center?.lon;
        if (elementLatitude === undefined || elementLongitude === undefined) continue;
        const distanceMeters = Math.round(haversineKm(point, [elementLongitude, elementLatitude]) * 1000);
        if (distanceMeters > radiusMeters) continue;
        services.push({ id: `${element.type}/${element.id}`, name: elementTags.name ?? category[0].toUpperCase() + category.slice(1), category, point: [elementLongitude, elementLatitude], distanceMeters, phones: extractPhones(elementTags) });
      }
      const deduped: NearbyEmergencyService[] = [];
      for (const candidate of services.sort((a, b) => b.phones.length - a.phones.length || a.distanceMeters - b.distanceMeters)) {
        const isDuplicate = deduped.some((existing) => existing.category === candidate.category && haversineKm(existing.point, candidate.point) * 1000 < 60);
        if (!isDuplicate) deduped.push(candidate);
      }
      return deduped.sort((a, b) => a.distanceMeters - b.distanceMeters);
    } catch { return null; }
  };

  // Race all Overpass mirrors and take whichever succeeds first, rather than trying them one at a time —
  // a single slow/overloaded mirror shouldn't block a healthy one from answering.
  const firstSuccessful = (promises: Array<Promise<NearbyEmergencyService[] | null>>): Promise<NearbyEmergencyService[] | null> => {
    return new Promise((resolve) => {
      let remaining = promises.length;
      if (remaining === 0) { resolve(null); return; }
      for (const promise of promises) {
        promise.then((value) => {
          remaining -= 1;
          if (value !== null) resolve(value);
          else if (remaining === 0) resolve(null);
        }).catch(() => { remaining -= 1; if (remaining === 0) resolve(null); });
      }
    });
  };

  const attempt = firstSuccessful(OVERPASS_INSTANCES.map(queryInstance));
  const services = await Promise.race([attempt, overallDeadline]);
  if (services) { EMERGENCY_SERVICES_CACHE.set(cacheKey, { savedAt: Date.now(), services }); return { services, degraded: false }; }
  // The live lookup failed or timed out — this is NOT the same as "confirmed nothing nearby".
  // Serve a stale cache entry if we have one, but always flag the result as degraded so callers
  // don't mistake a failed check for a verified empty area.
  return { services: cached?.services ?? [], degraded: true };
}

export function tileAt(longitude: number, latitude: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const latitudeRadians = latitude * Math.PI / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * n);
  return { x, y };
}

export function offlineTilesForRoute(geometry: unknown, zoom = 13, maxTiles = 250) {
  const points = routePoints(geometry);
  if (!points.length) return { zoom, tileCount: 0, tiles: [] as string[] };
  const bounds = boundsOf(points);
  const buffer = 0.06;
  const south = Math.max(-85, bounds.minLat - buffer);
  const north = Math.min(85, bounds.maxLat + buffer);
  const west = Math.max(-180, bounds.minLng - buffer);
  const east = Math.min(180, bounds.maxLng + buffer);
  const topLeft = tileAt(west, north, zoom);
  const bottomRight = tileAt(east, south, zoom);
  const tiles: string[] = [];
  outer: for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
    for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
      if (tiles.length >= maxTiles) break outer;
      tiles.push(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
    }
  }
  return { zoom, tileCount: tiles.length, tiles };
}

function demoBmdAlert(geometry: unknown): BmdAlert | null {
  if (process.env.DEMO_BMD_WARNING !== "1") return null;
  const points = routePoints(geometry);
  if (!points.length) return null;
  const bounds = boundsOf(points);
  const padding = 0.35;
  const box: Array<[number, number]> = [
    [bounds.minLng - padding, bounds.minLat - padding],
    [bounds.minLng - padding, bounds.maxLat + padding],
    [bounds.maxLng + padding, bounds.maxLat + padding],
    [bounds.maxLng + padding, bounds.minLat - padding],
    [bounds.minLng - padding, bounds.minLat - padding],
  ];
  return { provider: "bmd", id: "demo-weather-warning", event: "Rain", severity: "Severe", headline: "Heavy rainfall warning along your route corridor", instruction: "Carry rain protection and avoid low-lying stretches.", area: "Route corridor", effective: new Date().toISOString(), expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), polygons: [box] };
}

export async function buildReadinessReport(geometry: unknown): Promise<ReadinessReport> {
  const [alerts, floods, shelter, offlineMap] = await Promise.all([
    fetchBmdAlerts(),
    fetchFloodWarnings(),
    nearestShelter(geometry),
    Promise.resolve(offlineTilesForRoute(geometry)),
  ]);
  const demoAlert = demoBmdAlert(geometry);
  if (demoAlert) alerts.push(demoAlert);
  const warnings = warningsNearRoute(geometry, alerts, floods);
  const status = warnings.length ? "escalated" : "ready";
  const sources = [...new Set(warnings.map((warning) => warning.provider))].sort();
  const source = sources.length ? sources.join("+") as "bmd" | "bwdb" | "bmd+bwdb" : null;
  return { status, source, warnings, nearestShelter: shelter, offlineMap, checkedAt: new Date().toISOString() };
}
