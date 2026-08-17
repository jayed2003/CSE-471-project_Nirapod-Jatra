import { riskLevel, floodStatusFor, floodStatusForRoute, type RiskInputs } from "./risk.js";
import { getHourlyWeatherForecast, getAirQualityForecast, type HourlyWeatherPoint, type AirQualityForecastPoint } from "./weather.js";
import { fetchFloodWarnings, routePoints } from "./warnings.js";

export type DepartureOption = {
  departureTime: string;
  riskLevel: "Low" | "Moderate" | "High" | "Severe";
  recommendation: "Recommended" | "Acceptable" | "Avoid";
  aqi?: number;
  weatherDescription?: string;
  temperature?: number;
};

export type DepartureRecommendation = {
  options: DepartureOption[];
  recommendedDeparture: string | null;
  bestWindow: { start: string; end: string } | null;
  explanation: string;
  degraded: boolean;
};

function demoAqiSequence(): number[] | null {
  const raw = (process.env.DEMO_TRIP_TIME_AQI ?? "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  return raw.length ? raw : null;
}

function nearestWeatherPoint(points: HourlyWeatherPoint[], targetIso: string): HourlyWeatherPoint | undefined {
  if (!points.length) return undefined;
  const target = new Date(targetIso).getTime();
  return points.reduce((closest, point) => {
    const diff = Math.abs(new Date(point.time).getTime() - target);
    const closestDiff = Math.abs(new Date(closest.time).getTime() - target);
    return diff < closestDiff ? point : closest;
  }, points[0]);
}

function recommendationFor(level: DepartureOption["riskLevel"]): DepartureOption["recommendation"] {
  if (level === "Low") return "Recommended";
  if (level === "Moderate") return "Acceptable";
  return "Avoid";
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function longestLowRiskWindow(options: DepartureOption[]): { start: string; end: string } | null {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;
  options.forEach((option, index) => {
    if (option.riskLevel === "Low") {
      if (runLength === 0) runStart = index;
      runLength += 1;
      if (runLength > bestLength) { bestLength = runLength; bestStart = runStart; }
    } else {
      runLength = 0;
    }
  });
  if (bestLength === 0) return null;
  return { start: options[bestStart].departureTime, end: options[bestStart + bestLength - 1].departureTime };
}

export async function recommendDepartureTime(destinationPoint: [number, number], routeGeometry?: unknown): Promise<DepartureRecommendation> {
  const [longitude, latitude] = destinationPoint;
  try {
    const [hourlyWeather, aqiForecast, floods] = await Promise.all([
      getHourlyWeatherForecast(latitude, longitude),
      getAirQualityForecast(latitude, longitude),
      fetchFloodWarnings(),
    ]);
    const points = routeGeometry ? routePoints(routeGeometry) : [];
    const floodStatus = points.length ? floodStatusForRoute(points, floods) : floodStatusFor(destinationPoint, floods);
    const demoAqi = demoAqiSequence();

    const options: DepartureOption[] = (aqiForecast as AirQualityForecastPoint[]).map((aqiPoint, index) => {
      const weatherPoint = nearestWeatherPoint(hourlyWeather, aqiPoint.observedAt);
      const aqi = demoAqi ? demoAqi[index % demoAqi.length] : aqiPoint.aqi;
      const input: RiskInputs = { aqi, floodStatus, dengueStatus: "None", weatherDescription: weatherPoint?.description, temperature: weatherPoint?.temperature };
      const level = riskLevel(input);
      return { departureTime: aqiPoint.observedAt, riskLevel: level, recommendation: recommendationFor(level), aqi, weatherDescription: weatherPoint?.description, temperature: weatherPoint?.temperature };
    });

    const bestWindow = longestLowRiskWindow(options);
    const recommendedDeparture = bestWindow ? bestWindow.start : options.find((option) => option.riskLevel !== "Severe")?.departureTime ?? null;
    const explanation = bestWindow
      ? `Recommended departure: ${formatTime(recommendedDeparture)}. Expected risk is lowest between ${formatTime(bestWindow.start)}–${formatTime(bestWindow.end)}.`
      : "No low-risk window found in the next 24 hours; conditions are elevated throughout.";
    return { options, recommendedDeparture, bestWindow, explanation, degraded: false };
  } catch {
    return { options: [], recommendedDeparture: null, bestWindow: null, explanation: "Departure-time forecast is temporarily unavailable.", degraded: true };
  }
}
