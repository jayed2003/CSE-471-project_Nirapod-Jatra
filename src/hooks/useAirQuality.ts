"use client";

import { useCallback, useEffect, useState } from "react";
import type { AirQuality, AirQualityForecastPoint } from "@/services/weather";

type AirData = { current: AirQuality; forecast: AirQualityForecastPoint[] };
export function useAirQuality(latitude: number, longitude: number) {
  const [data, setData] = useState<AirData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); setError(null); try { const response = await fetch(`/api/environment?scope=air&lat=${latitude}&lon=${longitude}`); if (!response.ok) throw new Error(); setData(await response.json() as AirData); } catch { setError(navigator.onLine ? "Air quality data unavailable." : "Please check your internet connection."); } finally { setLoading(false); } }, [latitude, longitude]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}