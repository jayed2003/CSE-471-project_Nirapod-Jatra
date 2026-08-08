import { fetchJson } from "./fetchJson";

export const ENABLE_OPENWEATHER_FORECAST = false;
export async function getOpenWeatherForecast(latitude: number, longitude: number) { if (!ENABLE_OPENWEATHER_FORECAST) return null; const key = process.env.OPENWEATHER_API_KEY; if (!key) throw new Error("OpenWeather API key is not configured"); return fetchJson(`https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${key}&units=metric`); }