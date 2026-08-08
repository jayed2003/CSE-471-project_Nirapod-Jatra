import { fetchJson } from "./fetchJson";

export const ENABLE_FIRE_WEATHER = false;
export async function getFireWeatherIndex(latitude: number, longitude: number) { if (!ENABLE_FIRE_WEATHER) return null; const key = process.env.OPENWEATHER_API_KEY; if (!key) throw new Error("OpenWeather API key is not configured"); return fetchJson(`https://api.openweathermap.org/data/2.5/fwi?lat=${latitude}&lon=${longitude}&appid=${key}`); }