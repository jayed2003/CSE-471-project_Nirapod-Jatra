"use client";

import { Wind } from "lucide-react";
import { useAirQuality } from "@/hooks/useAirQuality";

export function AirQualityCard({ lat, lon }: { lat: number; lon: number }) {
  const { data, loading, error } = useAirQuality(lat, lon);
  const tone = data ? `aqi-${data.current.aqi}` : "";
  return <article className="env-card air-card" aria-label="Current air quality"><header><Wind size={18} /><h3>Air quality</h3></header>{loading && <p className="env-loading">Loading air quality...</p>}{error && <p className="env-error">{error}</p>}{data && <><div className={`aqi-readout ${tone}`}><strong>{data.current.aqi}</strong><span>{data.current.label}</span></div><dl><div><dt>PM2.5</dt><dd>{data.current.pm25} µg/m³</dd></div><div><dt>PM10</dt><dd>{data.current.pm10} µg/m³</dd></div><div><dt>O₃</dt><dd>{data.current.o3} µg/m³</dd></div></dl></>}</article>;
}