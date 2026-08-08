import { cached, fetchJson } from "./fetchJson";
import { weatherDescription } from "@/utils/weatherCodeMap";
import type { CurrentWeather, WeatherForecastDay } from "./types";

type OpenMeteoResponse = { current: { time: string; temperature_2m: number; weathercode: number; relative_humidity_2m: number; wind_speed_10m: number }; daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] } };
const baseUrl = "https://api.open-meteo.com/v1/forecast";
export function normalizeCurrentWeather(current: OpenMeteoResponse["current"]): CurrentWeather { return { temperature: current.temperature_2m, humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m, weatherCode: current.weathercode, description: weatherDescription(current.weathercode), observedAt: current.time }; }

export function getCurrentWeather(latitude: number, longitude: number) {
  return cached("current-weather", latitude, longitude, async (): Promise<CurrentWeather> => {
    const url = `${baseUrl}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relative_humidity_2m,wind_speed_10m`;
    const data = await fetchJson<OpenMeteoResponse>(url);
    return normalizeCurrentWeather(data.current);
  });
}

export function getWeatherForecast(latitude: number, longitude: number) {
  return cached("weather-forecast", latitude, longitude, async (): Promise<WeatherForecastDay[]> => {
    const url = `${baseUrl}?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const data = await fetchJson<OpenMeteoResponse>(url);
    return data.daily.time.slice(0, 5).map((date, index) => ({ date, minTemperature: data.daily.temperature_2m_min[index], maxTemperature: data.daily.temperature_2m_max[index], weatherCode: data.daily.weathercode[index], description: weatherDescription(data.daily.weathercode[index]) }));
  });
}