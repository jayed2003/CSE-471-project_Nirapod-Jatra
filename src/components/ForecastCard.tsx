"use client";

import { CalendarDays } from "lucide-react";
import { useWeather } from "@/hooks/useWeather";

export function ForecastCard({ lat, lon }: { lat: number; lon: number }) {
  const { data, loading, error } = useWeather(lat, lon);
  return <article className="env-card forecast-card" aria-label="Five day weather forecast"><header><CalendarDays size={18} /><h3>5-day outlook</h3></header>{loading && <p className="env-loading">Loading forecast...</p>}{error && <p className="env-error">Weather data unavailable.</p>}{data && <ul>{data.forecast.map((day) => <li key={day.date}><time>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</time><span>{day.description}</span><strong>{Math.round(day.minTemperature)}° / {Math.round(day.maxTemperature)}°</strong></li>)}</ul>}</article>;
}