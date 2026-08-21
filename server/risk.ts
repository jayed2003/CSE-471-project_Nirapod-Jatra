import { fetchFloodWarnings, haversineKm, routePoints, type FloodWarning } from "./warnings.js";
export type RiskInputs = {
  aqi: number;
  floodStatus: "None" | "Watch" | "Warning";
  dengueStatus?: "None" | "Watch" | "Warning";
  weatherAlert?: string;
  weatherDescription?: string;
  temperature?: number;
  unrestAlert?: string;
};
const FLOOD_RADIUS_KM = 25;
export function floodStatusFor(
  point: [number, number],
  stations: FloodWarning[],
): "None" | "Watch" | "Warning" {
  let nearest: FloodWarning | null = null;
  let nearestDistance = Infinity;
  for (const station of stations) {
    const distance = haversineKm(point, station.point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = station;
    }
  }
  if (!nearest || nearestDistance > FLOOD_RADIUS_KM || nearest.status === "None") return "None";
  return nearest.status;
}
export function floodStatusForRoute(
  points: Array<[number, number]>,
  stations: FloodWarning[],
): "None" | "Watch" | "Warning" {
  if (!points.length) return "None";
  let worst: "None" | "Watch" | "Warning" = "None";
  for (const point of points) {
    const status = floodStatusFor(point, stations);
    if (status === "Warning") return "Warning";
    if (status === "Watch") worst = "Watch";
  }
  return worst;
}
const AQI_INDEX_LEVELS: Record<number, "Low" | "Moderate" | "High" | "Severe"> = {
  1: "Low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Severe",
};
export function aqiLevel(aqi: number): "Low" | "Moderate" | "High" | "Severe" {
  if (aqi <= 5) return AQI_INDEX_LEVELS[aqi] ?? "Low";
  return "Low";
}
function aqiAdvice(aqi: number) {
  const level = aqiLevel(aqi);
  if (level === "Low") return "Air quality is suitable for normal outdoor activity";
  if (level === "Moderate") return "Sensitive travelers should limit extended outdoor activity";
  if (level === "High") return "Reduce prolonged outdoor exertion";
  return "Avoid outdoor exertion and use a filtered indoor space";
}
export function riskLevel(input: RiskInputs): "Low" | "Moderate" | "High" | "Severe" {
  if (
    input.floodStatus === "Warning" ||
    input.dengueStatus === "Warning" ||
    input.unrestAlert ||
    input.aqi > 4
  )
    return "Severe";
  if (
    input.floodStatus === "Watch" ||
    input.dengueStatus === "Watch" ||
    input.weatherAlert ||
    input.aqi > 3
  )
    return "High";
  if (input.aqi > 2) return "Moderate";
  return "Low";
}
export function severityRank(level: "Low" | "Moderate" | "High" | "Severe") {
  return { Low: 1, Moderate: 2, High: 3, Severe: 4 }[level];
}
export function buildBrief(input: RiskInputs) {
  const weather =
    input.weatherAlert ??
    (input.weatherDescription
      ? `${input.weatherDescription}${input.temperature !== undefined ? `, ${Math.round(input.temperature)} C` : ""}`
      : "No alerts");
  return `Overall risk: ${riskLevel(input)}. Flood risk: ${input.floodStatus}. Dengue risk: ${input.dengueStatus ?? "None"}. AQI: ${input.aqi} - ${aqiAdvice(input.aqi)}. Weather: ${weather}. Unrest: ${input.unrestAlert ?? "No alerts"}.`;
}
export function baselineRisk(): RiskInputs {
  return { aqi: 2, floodStatus: "None", dengueStatus: "None" };
}

const SEVERE_WEATHER_CODES = new Set([65, 75, 82, 95, 96, 99]);
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};
type LiveWeather = { temperature_2m: number; weathercode: number };
export async function fetchLiveRisk(
  destinationPoint: [number, number],
  route?: { geometry?: unknown },
): Promise<RiskInputs> {
  try {
    const [longitude, latitude] = destinationPoint;
    const [weather, air, floods] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode`,
        { signal: AbortSignal.timeout(8_000) },
      ).then((response) => {
        if (!response.ok) throw new Error("Weather provider unavailable");
        return response.json() as Promise<{ current: LiveWeather }>;
      }),
      fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${process.env.OPENWEATHER_API_KEY}`,
        { signal: AbortSignal.timeout(8_000) },
      ).then((response) => {
        if (!response.ok) throw new Error("Air quality provider unavailable");
        return response.json() as Promise<{ list: Array<{ main: { aqi: number } }> }>;
      }),
      fetchFloodWarnings(),
    ]);
    const current = weather.current;
    const demoAqi = Number(process.env.DEMO_RISK_AQI);
    const aqi =
      Number.isInteger(demoAqi) && demoAqi >= 1 && demoAqi <= 5
        ? demoAqi
        : Math.max(1, Math.min(5, air.list[0]?.main.aqi ?? 2));
    const weatherAlert =
      SEVERE_WEATHER_CODES.has(current.weathercode) || current.temperature_2m >= 42
        ? `Severe weather in effect`
        : undefined;
    const routePointsList = routePoints(route?.geometry);
    const floodStatus = routePointsList.length
      ? floodStatusForRoute(routePointsList, floods)
      : floodStatusFor(destinationPoint, floods);
    return {
      aqi,
      floodStatus,
      dengueStatus: "None",
      weatherAlert,
      weatherDescription: WEATHER_DESCRIPTIONS[current.weathercode] ?? "Unknown conditions",
      temperature: current.temperature_2m,
    };
  } catch {
    return baselineRisk();
  }
}
