import { NextRequest, NextResponse } from "next/server";

type Point = [number, number];
type NormalizedRoute = { geometry: GeoJSON.Geometry; distanceKm: number; durationMin: number; instructions: Array<{ name: string; instruction: string }>; isFallback: boolean; score: number; recommended: boolean };
function fallbackRoute(start: Point, end: Point) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat = radians(end[1] - start[1]);
  const lon = radians(end[0] - start[0]);
  const formula = Math.sin(lat / 2) ** 2 + Math.cos(radians(start[1])) * Math.cos(radians(end[1])) * Math.sin(lon / 2) ** 2;
  const meters = 6_371_000 * 2 * Math.atan2(Math.sqrt(formula), Math.sqrt(1 - formula));
  return { geometry: { type: "LineString", coordinates: [start, end] }, distanceKm: Number((meters / 1000).toFixed(1)), durationMin: Math.max(1, Math.round(meters / 11 / 60)), instructions: [], isFallback: true, score: 100, recommended: true };
}
function scoreRoute(distanceKm: number, durationMin: number, aqi: number, weatherAlert: boolean) { return Math.round(distanceKm * 1.5 + durationMin * 0.7 + (aqi > 150 ? 35 : aqi > 100 ? 18 : aqi > 50 ? 7 : 0) + (weatherAlert ? 20 : 0)); }
export async function GET(request: NextRequest) {
  const values = ["startLng", "startLat", "endLng", "endLat"].map((key) => Number(request.nextUrl.searchParams.get(key)));
  if (values.some((value) => !Number.isFinite(value))) return NextResponse.json({ error: "Routing failed." }, { status: 400 });
  const [startLng, startLat, endLng, endLat] = values;
  const start: Point = [startLng, startLat]; const end: Point = [endLng, endLat];
  try {
    const aqi = Number(request.nextUrl.searchParams.get("aqi") ?? 0); const weatherAlert = request.nextUrl.searchParams.get("weatherAlert") === "true";
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!upstream.ok) return NextResponse.json(fallbackRoute(start, end));
    const sourceRoutes = (await upstream.json() as { routes?: Array<{ geometry: GeoJSON.Geometry; distance: number; duration: number; legs: Array<{ steps: Array<{ name: string; maneuver: { type: string; modifier?: string } }> }> }> }).routes;
    if (!sourceRoutes?.length) return NextResponse.json({ routes: [fallbackRoute(start, end)] });
    const routes: NormalizedRoute[] = sourceRoutes.slice(0, 3).map((route) => { const distanceKm = Number((route.distance / 1000).toFixed(1)); const durationMin = Math.max(1, Math.round(route.duration / 60)); return { geometry: route.geometry, distanceKm, durationMin, instructions: route.legs.flatMap((leg) => leg.steps.map((step) => ({ name: step.name || "Continue", instruction: `${step.maneuver.type}${step.maneuver.modifier ? ` ${step.maneuver.modifier}` : ""}` }))), isFallback: false, score: scoreRoute(distanceKm, durationMin, aqi, weatherAlert), recommended: false }; });
    const recommended = routes.reduce((best, route) => route.score < best.score ? route : best); recommended.recommended = true;
    return NextResponse.json({ routes });
  } catch { return NextResponse.json(fallbackRoute(start, end)); }
}