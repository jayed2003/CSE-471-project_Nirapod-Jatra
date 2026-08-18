import { haversineKm } from "./warnings.js";

export type AttractionCategory = "landmark" | "museum" | "nature" | "park" | "entertainment";

export type TouristAttraction = {
  id: string;
  name: string;
  category: AttractionCategory;
  kind: string;
  point: [number, number];
};

type WikiPage = {
  pageid: number;
  title: string;
  description?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
};

// Wikipedia's geosearch already gives us a strong "this is actually notable" filter for free —
// obscure places don't get Wikipedia articles. What it doesn't filter is *type*: it happily
// returns administrative divisions, schools, historical events, and organizations that happen to
// be geotagged. Wikidata short descriptions follow a "<TYPE> in/of/at/near/on <LOCATION>" shape,
// so a word like "district" is only a bad sign as the TYPE ("District in X") — as a trailing
// location qualifier ("Waterfall in Alikadam, X District") it's harmless and must not be excluded.
const CONNECTOR_PATTERN = /\s+(?:in|of|at|near|on)\s+/i;
function typePortion(description: string): string {
  const match = CONNECTOR_PATTERN.exec(description);
  return match ? description.slice(0, match.index) : description;
}

// Safe to match anywhere in the description — these words essentially never show up as an
// innocent trailing location qualifier the way "district" or "city" can.
const STRONG_EXCLUDE_PATTERN = /\b(schools?|colleges?|universit(y|ies)|academ(y|ies)|institutes?|institutions?|education board|research cent(er|re)|hospitals?|clinics?|medical college|stations?|airports?|seaport|ports?|highway|motorway|expressway|streets?|roads?|governing body|government (agency|body)|ministr(y|ies)|embass(y|ies)|diplomatic mission|consulate|parliament|legislature|city council|municipal council|political part(y|ies)|constituenc(y|ies)|cantonment|eparchy|dioceses?|archdiocese|oil ?field|revolutions?|empires?|sieges?|battles?|wars?|attacks?|bombings?|uprisings?|massacres?|coups?|riots?|protests?|demonstrations?|upheavals?|treat(y|ies)|timeline of|anniversar(y|ies)|festivals?|ceremon(y|ies)|tournaments?|championships?|conferences?|\bedition\b|parades?|photographs?|transportation of|newspapers?|magazines?|television channel|radio station|compan(y|ies)|corporations?|chains?|department store|shops?|stores?|banks?|airlines?|football club|cricket club|research institute|federations?|organi[sz]ations?|foundations?|non-profit|prisons?|courthouse|courts?|\bboard\b|demolished|destroyed|formerly|\bformer\b|brothel|communes?|capital of|(technology|business|innovation|industrial|science|tech|office) park|suicides?)\b/i;
const EXCLUDE_DATE_RANGE_PATTERN = /\(\s*\d{3,4}\s*[-–—]\s*\d{3,4}\s*\)/;

// Only a bad sign when it IS the page's type (checked against the portion before the first
// "in/of/at/near/on"), since these words routinely appear as harmless location qualifiers too.
const GEOGRAPHIC_TYPE_EXCLUDE_PATTERN = /\b(cities|city|towns?|villages?|upazil(a|as)|than(a|as)|unions?|municipalit(y|ies)|districts?|divisions?|subdivisions?|arrondissement|boroughs?|wards?|neighbou?rhoods?|localit(y|ies)|suburbs?|metropolis|hamlets?|parish|counties|county|provinces?|states?|countr(y|ies)|areas?)\b/i;

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; category: AttractionCategory }> = [
  { pattern: /\b(museum|gallery)\b/i, category: "museum" },
  { pattern: /\b(zoo|aquarium|theme park|amusement park|water park|planetarium|theatres?|theaters?|cinemas?|stadiums?|arenas?)\b/i, category: "entertainment" },
  { pattern: /\b(beach|waterfalls?|lakes?|islands?|hills?|mountains?|peaks?|viewpoints?|forests?|wildlife sanctuary|nature reserve|caves?|valleys?|rivers?)\b/i, category: "nature" },
  { pattern: /\b(parks?|gardens?|botanical)\b/i, category: "park" },
  { pattern: /\b(temples?|mosques?|churches?|shrines?|mazar|monaster(y|ies)|cathedrals?|synagogues?|pagodas?|stupas?|forts?|fortress|palaces?|castles?|citadel|archaeological site|ruins|monuments?|memorials?|mausoleum|tombs?|heritage site|historic (house|site)|towers?|minar|gates?|walls?|fountains?|squares?|plaz(a|as)|statues?|sculptures?|bridges?|lighthouse|observator(y|ies)|markets?|librar(y|ies)|shrines?)\b/i, category: "landmark" },
];

function classifyAttraction(description: string): { category: AttractionCategory; kind: string } | null {
  if (!description || STRONG_EXCLUDE_PATTERN.test(description) || EXCLUDE_DATE_RANGE_PATTERN.test(description)) return null;
  if (GEOGRAPHIC_TYPE_EXCLUDE_PATTERN.test(typePortion(description))) return null;
  for (const { pattern, category } of CATEGORY_KEYWORDS) {
    if (pattern.test(description)) return { category, kind: description };
  }
  return { category: "landmark", kind: description };
}

const WIKI_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const WIKI_MAX_RADIUS_METERS = 10_000; // hard limit enforced by Wikipedia's geosearch API

async function queryWikiPage(searchPoint: [number, number], radiusMeters: number): Promise<TouristAttraction[] | null> {
  const [longitude, latitude] = searchPoint;
  const url = `${WIKI_ENDPOINT}?action=query&generator=geosearch&ggscoord=${latitude}%7C${longitude}&ggsradius=${radiusMeters}&ggslimit=50&prop=description%7Ccoordinates&colimit=max&format=json&formatversion=2`;
  try {
    const response = await fetch(url, { headers: { "user-agent": "WaymarkSafety/1.0 (local development)" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const body = await response.json() as { query?: { pages?: WikiPage[] } };
    const pages = body.query?.pages ?? [];
    const attractions: TouristAttraction[] = [];
    for (const page of pages) {
      const coords = page.coordinates?.[0];
      if (!coords) continue;
      const classification = classifyAttraction(page.description ?? "");
      if (!classification) continue;
      attractions.push({ id: `wiki/${page.pageid}`, name: page.title, category: classification.category, kind: classification.kind, point: [coords.lon, coords.lat] });
    }
    return attractions;
  } catch {
    return null;
  }
}

// Great-circle destination point (standard forward geodesic formula) — used to fan out satellite
// searches around a center point, since Wikipedia caps a single geosearch at a 10km radius.
function offsetPoint(point: [number, number], km: number, bearingDeg: number): [number, number] {
  const earthRadiusKm = 6371;
  const bearing = bearingDeg * Math.PI / 180;
  const latRad = point[1] * Math.PI / 180;
  const lonRad = point[0] * Math.PI / 180;
  const angularDistance = km / earthRadiusKm;
  const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(angularDistance) + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing));
  const newLonRad = lonRad + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad), Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLatRad));
  return [((newLonRad * 180 / Math.PI + 540) % 360) - 180, newLatRad * 180 / Math.PI];
}

const MIN_DESIRED_RESULTS = 6;
const RING_OFFSET_KM = 15;
// Only 4 directions, not 8 — halves the worst-case request burst for a sparse search. Tourist
// attractions don't move, so a slightly coarser ring costs little while being much gentler on a
// free, rate-limited public API (this app has no API key or paid quota to fall back on).
const RING_BEARINGS = [0, 90, 180, 270];
const MAX_RESULTS = 60;
const ATTRACTIONS_CACHE = new Map<string, { savedAt: number; attractions: TouristAttraction[] }>();
// Attraction data is effectively static day to day, so cache aggressively — this is what makes
// the feature resilient to the free Wikipedia API having a slow or rate-limited moment: once a
// destination has been looked up once, it stays fast and available for a long time afterward.
const ATTRACTIONS_CACHE_MS = 24 * 60 * 60 * 1000;

export type NearbyAttractionsResult = { attractions: TouristAttraction[]; degraded: boolean };

export async function findTouristAttractions(point: [number, number], radiusMeters = WIKI_MAX_RADIUS_METERS): Promise<NearbyAttractionsResult> {
  const [longitude, latitude] = point;
  const radius = Math.min(Math.max(Math.round(radiusMeters), 500), WIKI_MAX_RADIUS_METERS);
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radius}`;
  const cached = ATTRACTIONS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < ATTRACTIONS_CACHE_MS) return { attractions: cached.attractions, degraded: false };

  const primary = await queryWikiPage(point, radius);
  const byId = new Map<string, TouristAttraction>();
  let anySucceeded = primary !== null;
  for (const item of primary ?? []) byId.set(item.id, item);

  // A sparse result near the exact search point doesn't mean the destination has nothing to see —
  // it often means the town center itself is quiet but the wider district isn't. Wikipedia caps a
  // single geosearch at 10km, so we can't just ask for a bigger radius; instead fan out a ring of
  // satellite 10km searches ~15km out in 8 directions, which together cover roughly a 25km radius
  // (comfortably spanning a whole district) without exceeding the API's per-request limit.
  if (radius >= 5_000 && byId.size < MIN_DESIRED_RESULTS) {
    const satellites = await Promise.all(RING_BEARINGS.map((bearing) => queryWikiPage(offsetPoint(point, RING_OFFSET_KM, bearing), radius)));
    for (const batch of satellites) {
      if (batch === null) continue;
      anySucceeded = true;
      for (const item of batch) if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  if (!anySucceeded) {
    // Every lookup failed — not the same as "confirmed no attractions". Serve a stale cache entry
    // if we have one, but flag the result as degraded either way.
    return { attractions: cached?.attractions ?? [], degraded: true };
  }

  const ranked = Array.from(byId.values())
    .map((item) => ({ item, distanceMeters: Math.round(haversineKm(point, item.point) * 1000) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);

  ATTRACTIONS_CACHE.set(cacheKey, { savedAt: Date.now(), attractions: ranked });
  return { attractions: ranked, degraded: false };
}
