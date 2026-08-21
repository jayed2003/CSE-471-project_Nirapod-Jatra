import {
  pointInPolygon,
  routePoints,
  tileAt,
  nearbyEmergencyServices,
  type NearbyEmergencyService,
} from "./warnings.js";

export type LowNetworkZone = {
  id: string;
  name: string;
  region: string;
  description: string;
  polygon: Array<[number, number]>;
  centroid: [number, number];
  representativePoints: Array<{ label: string; point: [number, number] }>;
};

function rectangle(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Array<[number, number]> {
  return [
    [minLng, minLat],
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ];
}

function centroidOf(polygon: Array<[number, number]>): [number, number] {
  const lngs = polygon.map((point) => point[0]);
  const lats = polygon.map((point) => point[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

function zone(
  id: string,
  name: string,
  region: string,
  description: string,
  bbox: [number, number, number, number],
  representativePoints: Array<{ label: string; point: [number, number] }>,
): LowNetworkZone {
  const polygon = rectangle(...bbox);
  return {
    id,
    name,
    region,
    description,
    polygon,
    centroid: centroidOf(polygon),
    representativePoints,
  };
}

export const LOW_NETWORK_ZONES: LowNetworkZone[] = [
  zone(
    "tanguar-haor",
    "Tanguar Haor",
    "Sylhet haor basin",
    "A vast wetland ecosystem with seasonal boat-only access and sparse mobile coverage.",
    [91.02, 25.05, 91.14, 25.15],
    [{ label: "Tahirpur", point: [91.0864, 25.0847] }],
  ),
  zone(
    "hakaluki-haor",
    "Hakaluki Haor",
    "Sylhet haor basin",
    "Bangladesh's largest freshwater wetland, with patchy network coverage away from town centers.",
    [92.0, 24.65, 92.25, 24.85],
    [{ label: "Fenchuganj", point: [92.0906, 24.7167] }],
  ),
  zone(
    "rangamati-cht",
    "Rangamati & Kaptai Lake",
    "Chittagong Hill Tracts",
    "Hilly, lake-fragmented terrain with limited cell tower density outside Rangamati town.",
    [92.05, 22.55, 92.35, 22.85],
    [{ label: "Rangamati Sadar", point: [92.1998, 22.6533] }],
  ),
  zone(
    "bandarban-cht",
    "Bandarban Hill Tracts",
    "Chittagong Hill Tracts",
    "Mountainous border region with frequent dead zones between ridgelines.",
    [92.15, 21.75, 92.4, 22.1],
    [{ label: "Bandarban Sadar", point: [92.2184, 22.1953] }],
  ),
  zone(
    "khagrachari-cht",
    "Khagrachari Hill Tracts",
    "Chittagong Hill Tracts",
    "Remote hill district with inconsistent coverage on inter-upazila roads.",
    [91.85, 23.05, 92.05, 23.3],
    [{ label: "Khagrachari Sadar", point: [91.9847, 23.1193] }],
  ),
  zone(
    "sundarbans-river",
    "Sundarbans river routes",
    "Khulna mangrove/river delta",
    "Mangrove river routes with no cellular infrastructure inside the forest boundary.",
    [89.4, 21.7, 89.9, 22.1],
    [{ label: "Mongla", point: [89.6083, 22.4791] }],
  ),
  zone(
    "teknaf-stmartins",
    "Teknaf–St. Martin's coastal route",
    "Cox's Bazar coast",
    "Sea-crossing route to St. Martin's Island with coverage gaps mid-channel.",
    [92.15, 20.6, 92.45, 21.05],
    [{ label: "Teknaf town", point: [92.3049, 20.8624] }],
  ),
  zone(
    "chalan-beel",
    "Chalan Beel wetlands",
    "Rajshahi/Natore wetlands",
    "Low-lying seasonal wetland basin with sparse rural coverage.",
    [89.1, 24.15, 89.4, 24.4],
    [{ label: "Gurudaspur", point: [89.2564, 24.2814] }],
  ),
];

export function demoLowNetworkZoneIds(): string[] {
  return (process.env.DEMO_LOW_NETWORK_ZONE ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

export function zonesAlongRoute(geometry: unknown): LowNetworkZone[] {
  const points = routePoints(geometry);
  const demoIds = demoLowNetworkZoneIds();
  return LOW_NETWORK_ZONES.filter(
    (candidate) =>
      demoIds.includes(candidate.id) ||
      points.some(([lng, lat]) => pointInPolygon(lng, lat, candidate.polygon)),
  );
}

export type ZoneEmergencyBundle = { services: NearbyEmergencyService[]; degraded: boolean };

export async function emergencyBundleForZone(target: LowNetworkZone): Promise<ZoneEmergencyBundle> {
  const results = await Promise.all(
    target.representativePoints.map((representative) =>
      nearbyEmergencyServices(representative.point),
    ),
  );
  const seen = new Set<string>();
  const services: NearbyEmergencyService[] = [];
  let degraded = false;
  for (const result of results) {
    degraded = degraded || result.degraded;
    for (const service of result.services) {
      if (seen.has(service.id)) continue;
      seen.add(service.id);
      services.push(service);
    }
  }
  return { services, degraded };
}

export function offlineTilesForZone(target: LowNetworkZone, zoom = 12, maxTiles = 180) {
  const lngs = target.polygon.map((point) => point[0]);
  const lats = target.polygon.map((point) => point[1]);
  const west = Math.max(-180, Math.min(...lngs));
  const east = Math.min(180, Math.max(...lngs));
  const south = Math.max(-85, Math.min(...lats));
  const north = Math.min(85, Math.max(...lats));
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
