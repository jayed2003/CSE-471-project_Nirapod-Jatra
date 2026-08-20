"use client";

import { CloudSun, Droplets, Wind } from "lucide-react";
import { useWeather } from "@/hooks/useWeather";

export function WeatherCard({ lat, lon }: { lat: number; lon: number }) {
  const { data, loading, error } = useWeather(lat, lon);
  return (
    <article className="env-card weather-card" aria-label="Current weather">
      <header>
        <CloudSun size={18} />
        <h3>Current weather</h3>
      </header>
      {loading && <p className="env-loading">Loading weather...</p>}
      {error && <p className="env-error">{error}</p>}
      {data && (
        <>
          <div className="temperature">
            {Math.round(data.current.temperature)}
            <sup>°C</sup>
          </div>
          <strong>{data.current.description}</strong>
          <dl>
            <div>
              <dt>
                <Droplets size={14} />
                Humidity
              </dt>
              <dd>{data.current.humidity}%</dd>
            </div>
            <div>
              <dt>
                <Wind size={14} />
                Wind
              </dt>
              <dd>{Math.round(data.current.windSpeed)} km/h</dd>
            </div>
          </dl>
          <time>
            Updated{" "}
            {new Date(data.current.observedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </>
      )}
    </article>
  );
}
