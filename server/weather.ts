const TIMEOUT_MS = 10_000;

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const CACHE_DURATION_MS = 10 * 60 * 1000;

export async function fetchJson<T>(url: string, attempts = 2): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
			if (!response.ok) throw new Error(`Request failed with ${response.status}`);
			return await response.json() as T;
		} catch (error) {
			lastError = error;
			if (attempt === attempts - 1) break;
		}
	}
	throw new Error(`Data provider unavailable: ${lastError instanceof Error ? lastError.message : "network error"}`);
}

export async function cached<T>(namespace: string, latitude: number, longitude: number, loader: () => Promise<T>): Promise<T> {
	const key = `${namespace}:${latitude},${longitude}`;
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (entry && entry.expiresAt > Date.now()) return entry.value;
	const running = pending.get(key) as Promise<T> | undefined;
	if (running) return running;
	const request = loader().then((value) => { cache.set(key, { value, expiresAt: Date.now() + CACHE_DURATION_MS }); return value; }).finally(() => pending.delete(key));
	pending.set(key, request);
	return request;
}

export function clearWeatherCache() { cache.clear(); pending.clear(); }

export const AQI_LABELS: Record<number, string> = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
export function aqiLabel(aqi: number) { return AQI_LABELS[aqi] ?? "Unknown"; }

export const WEATHER_CODE_MAP: Record<number, string> = {
	0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};

export function weatherDescription(code: number) { return WEATHER_CODE_MAP[code] ?? "Unknown conditions"; }

export type CurrentWeather = {
	temperature: number;
	humidity: number;
	windSpeed: number;
	weatherCode: number;
	description: string;
	observedAt: string;
};

export type WeatherForecastDay = { date: string; minTemperature: number; maxTemperature: number; weatherCode: number; description: string };
export type AirQuality = { aqi: number; label: string; pm25: number; pm10: number; o3: number; no2: number; so2: number; co: number; nh3: number; observedAt: string };
export type AirQualityForecastPoint = Pick<AirQuality, "aqi" | "label" | "pm25" | "pm10" | "o3" | "observedAt">;

type OpenMeteoResponse = { current: { time: string; temperature_2m: number; weathercode: number; relative_humidity_2m: number; wind_speed_10m: number }; daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] } };
const METE_BASE = "https://api.open-meteo.com/v1/forecast";

export function normalizeCurrentWeather(current: OpenMeteoResponse["current"]): CurrentWeather { return { temperature: current.temperature_2m, humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m, weatherCode: current.weathercode, description: weatherDescription(current.weathercode), observedAt: current.time }; }

export function getCurrentWeather(latitude: number, longitude: number) {
	return cached("current-weather", latitude, longitude, async (): Promise<CurrentWeather> => {
		const url = `${METE_BASE}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relative_humidity_2m,wind_speed_10m`;
		const data = await fetchJson<OpenMeteoResponse>(url);
		return normalizeCurrentWeather(data.current);
	});
}

export function getWeatherForecast(latitude: number, longitude: number) {
	return cached("weather-forecast", latitude, longitude, async (): Promise<WeatherForecastDay[]> => {
		const url = `${METE_BASE}?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
		const data = await fetchJson<OpenMeteoResponse>(url);
		return data.daily.time.slice(0, 5).map((date, index) => ({ date, minTemperature: data.daily.temperature_2m_min[index], maxTemperature: data.daily.temperature_2m_max[index], weatherCode: data.daily.weathercode[index], description: weatherDescription(data.daily.weathercode[index]) }));
	});
}

type AirResponse = { list: Array<{ dt: number; main: { aqi: number }; components: { pm2_5: number; pm10: number; o3: number; no2: number; so2: number; co: number; nh3: number } }> };
function apiKey() { const key = process.env.OPENWEATHER_API_KEY; if (!key) throw new Error("OpenWeather API key is not configured"); return key; }
export function normalizeAirQuality(item: AirResponse["list"][number]): AirQuality { return { aqi: item.main.aqi, label: aqiLabel(item.main.aqi), pm25: item.components.pm2_5, pm10: item.components.pm10, o3: item.components.o3, no2: item.components.no2, so2: item.components.so2, co: item.components.co, nh3: item.components.nh3, observedAt: new Date(item.dt * 1000).toISOString() }; }
export function getAirQuality(latitude: number, longitude: number) { return cached("air-quality", latitude, longitude, async () => { const data = await fetchJson<AirResponse>(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${apiKey()}`); return normalizeAirQuality(data.list[0]); }); }
export function getAirQualityForecast(latitude: number, longitude: number) { return cached("air-forecast", latitude, longitude, async (): Promise<AirQualityForecastPoint[]> => { const data = await fetchJson<AirResponse>(`https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey()}`); return data.list.filter((_, index) => index % 3 === 0).slice(0, 8).map(normalizeAirQuality); }); }