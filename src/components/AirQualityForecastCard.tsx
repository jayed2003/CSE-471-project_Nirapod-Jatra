"use client";

import { Clock3 } from "lucide-react";
import { useAirQuality } from "@/hooks/useAirQuality";

export function AirQualityForecastCard({ lat, lon }: { lat: number; lon: number }) {
  const { data, loading, error } = useAirQuality(lat, lon);
  return (
    <article className="env-card air-forecast-card" aria-label="24 hour air quality forecast">
      <header>
        <Clock3 size={18} />
        <h3>Next 24 hours</h3>
      </header>
      {loading && <p className="env-loading">Loading AQI forecast...</p>}
      {error && <p className="env-error">Air quality data unavailable.</p>}
      {data && (
        <ul>
          {data.forecast.map((point) => (
            <li key={point.observedAt}>
              <time>
                {new Date(point.observedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <span className={`aqi-dot aqi-${point.aqi}`} /> <strong>{point.label}</strong>
              <small>PM2.5 {point.pm25}</small>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
