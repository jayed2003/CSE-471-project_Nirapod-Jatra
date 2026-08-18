import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HourlyWeatherPoint, AirQualityForecastPoint } from "./weather.js";

vi.mock("./weather.js", async () => {
  const actual = await vi.importActual<typeof import("./weather.js")>("./weather.js");
  return { ...actual, getHourlyWeatherForecast: vi.fn(), getAirQualityForecast: vi.fn() };
});
vi.mock("./warnings.js", async () => {
  const actual = await vi.importActual<typeof import("./warnings.js")>("./warnings.js");
  return { ...actual, fetchFloodWarnings: vi.fn().mockResolvedValue([]) };
});

const HOURLY_WEATHER: HourlyWeatherPoint[] = Array.from({ length: 48 }, (_, index) => ({
  time: new Date(Date.UTC(2026, 7, 17, index)).toISOString(),
  temperature: 28,
  weatherCode: 1,
  description: "Mostly clear",
  precipitationProbability: 5,
}));

function aqiPoint(hour: number, aqi: number): AirQualityForecastPoint {
  return { aqi, label: "test", pm25: 10, pm10: 20, o3: 30, observedAt: new Date(Date.UTC(2026, 7, 17, hour)).toISOString() };
}

describe("recommendDepartureTime", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  it("ranks a contiguous low-AQI run as the best window", async () => {
    const { getHourlyWeatherForecast, getAirQualityForecast } = await import("./weather.js");
    vi.mocked(getHourlyWeatherForecast).mockResolvedValue(HOURLY_WEATHER);
    vi.mocked(getAirQualityForecast).mockResolvedValue([aqiPoint(6, 2), aqiPoint(9, 1), aqiPoint(12, 4), aqiPoint(15, 5), aqiPoint(18, 3), aqiPoint(21, 2)]);
    const { recommendDepartureTime } = await import("./tripTimeOptimizer.js");
    const result = await recommendDepartureTime([90.4125, 23.8103]);
    expect(result.degraded).toBe(false);
    expect(result.options).toHaveLength(6);
    expect(result.options[0].riskLevel).toBe("Low");
    expect(result.options[2].riskLevel).toBe("High");
    expect(result.bestWindow).toEqual({ start: aqiPoint(6, 2).observedAt, end: aqiPoint(9, 1).observedAt });
    expect(result.recommendedDeparture).toBe(aqiPoint(6, 2).observedAt);
    expect(result.explanation).toContain("Recommended departure");
  });

  it("holds flood status constant across every candidate hour", async () => {
    const { getHourlyWeatherForecast, getAirQualityForecast } = await import("./weather.js");
    const { fetchFloodWarnings } = await import("./warnings.js");
    vi.mocked(getHourlyWeatherForecast).mockResolvedValue(HOURLY_WEATHER);
    vi.mocked(getAirQualityForecast).mockResolvedValue([aqiPoint(6, 1), aqiPoint(9, 1)]);
    vi.mocked(fetchFloodWarnings).mockResolvedValue([{ provider: "bwdb", stationId: "SW1", station: "Test", district: "Test", point: [90.4125, 23.8103], status: "Warning", headline: "test", source: "demo" }]);
    const { recommendDepartureTime } = await import("./tripTimeOptimizer.js");
    const result = await recommendDepartureTime([90.4125, 23.8103]);
    expect(result.options.every((option) => option.riskLevel === "Severe")).toBe(true);
  });

  it("applies the DEMO_TRIP_TIME_AQI override sequence, cycling if shorter than the forecast", async () => {
    vi.stubEnv("DEMO_TRIP_TIME_AQI", "1,5");
    const { getHourlyWeatherForecast, getAirQualityForecast } = await import("./weather.js");
    vi.mocked(getHourlyWeatherForecast).mockResolvedValue(HOURLY_WEATHER);
    vi.mocked(getAirQualityForecast).mockResolvedValue([aqiPoint(6, 3), aqiPoint(9, 3), aqiPoint(12, 3)]);
    const { recommendDepartureTime } = await import("./tripTimeOptimizer.js");
    const result = await recommendDepartureTime([90.4125, 23.8103]);
    expect(result.options.map((option) => option.aqi)).toEqual([1, 5, 1]);
    vi.unstubAllEnvs();
  });

  it("returns degraded=true instead of a fabricated flat table when a forecast call fails", async () => {
    const { getHourlyWeatherForecast, getAirQualityForecast } = await import("./weather.js");
    vi.mocked(getHourlyWeatherForecast).mockRejectedValue(new Error("upstream down"));
    vi.mocked(getAirQualityForecast).mockResolvedValue([aqiPoint(6, 2)]);
    const { recommendDepartureTime } = await import("./tripTimeOptimizer.js");
    const result = await recommendDepartureTime([90.4125, 23.8103]);
    expect(result.degraded).toBe(true);
    expect(result.options).toEqual([]);
    expect(result.recommendedDeparture).toBeNull();
  });
});
