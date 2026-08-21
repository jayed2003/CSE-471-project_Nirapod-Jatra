export type Point = { lng: number; lat: number; label?: string };
export type RouteInfo = {
  geometry: GeoJSON.Geometry;
  distanceKm: number;
  durationMin: number;
  instructions: Array<{ name: string; instruction: string }>;
  isFallback: boolean;
  score: number;
  recommended: boolean;
};
export async function getRoute(
  start: Point,
  end: Point,
  environment: { aqi?: number; weatherAlert?: boolean } = {},
): Promise<RouteInfo[]> {
  const query = new URLSearchParams({
    startLng: String(start.lng),
    startLat: String(start.lat),
    endLng: String(end.lng),
    endLat: String(end.lat),
    aqi: String(environment.aqi ?? 0),
    weatherAlert: String(environment.weatherAlert ?? false),
  });
  const response = await fetch(`/api/routing?${query}`);
  if (!response.ok) throw new Error("Routing failed.");
  return ((await response.json()) as { routes: RouteInfo[] }).routes;
}
