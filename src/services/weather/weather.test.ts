import { describe, expect, it } from "vitest";
import { aqiLabel } from "@/utils/aqiMap";
import { weatherDescription } from "@/utils/weatherCodeMap";
import { clearWeatherCache, cached } from "./fetchJson";
import { normalizeCurrentWeather } from "./openMeteo";
import { normalizeAirQuality } from "./openWeatherAir";

describe("weather normalization", () => {
  it("normalizes Open-Meteo current weather", () => expect(normalizeCurrentWeather({ time: "2026-08-07T12:00", temperature_2m: 31, weathercode: 3, relative_humidity_2m: 72, wind_speed_10m: 11 })).toMatchObject({ temperature: 31, humidity: 72, description: "Overcast" }));
  it("normalizes OpenWeather air quality", () => expect(normalizeAirQuality({ dt: 0, main: { aqi: 3 }, components: { pm2_5: 22, pm10: 31, o3: 40, no2: 10, so2: 2, co: 100, nh3: 1 } })).toMatchObject({ aqi: 3, label: "Moderate", pm25: 22 }));
  it("maps AQI labels and weather codes", () => { expect(aqiLabel(5)).toBe("Very Poor"); expect(weatherDescription(95)).toBe("Thunderstorm"); });
  it("deduplicates cached requests", async () => { clearWeatherCache(); let calls = 0; const load = () => Promise.resolve(++calls); expect(await Promise.all([cached("test", 23.8, 90.4, load), cached("test", 23.8, 90.4, load)])).toEqual([1, 1]); expect(calls).toBe(1); });
});