"use client";

import { useCallback, useEffect, useState } from "react";
import type { CurrentWeather, WeatherForecastDay } from "@/services/weather";

type WeatherData = { current: CurrentWeather; forecast: WeatherForecastDay[] };
export function useWeather(latitude: number, longitude: number) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); setError(null); try { const response = await fetch(`/api/environment?scope=weather&lat=${latitude}&lon=${longitude}`); if (!response.ok) throw new Error(); setData(await response.json() as WeatherData); } catch { setError(navigator.onLine ? "Weather data unavailable." : "Please check your internet connection."); } finally { setLoading(false); } }, [latitude, longitude]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}