"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

type DepartureOption = {
  departureTime: string;
  riskLevel: "Low" | "Moderate" | "High" | "Severe";
  recommendation: "Recommended" | "Acceptable" | "Avoid";
  aqi?: number;
  weatherDescription?: string;
  temperature?: number;
};

type DepartureRecommendation = {
  options: DepartureOption[];
  recommendedDeparture: string | null;
  bestWindow: { start: string; end: string } | null;
  explanation: string;
  degraded: boolean;
};

const BADGE_LEVEL: Record<DepartureOption["riskLevel"], "safe" | "caution" | "alert"> = { Low: "safe", Moderate: "caution", High: "alert", Severe: "alert" };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TripTimeOptimizer({ lat, lon }: { lat: number; lon: number }) {
  const [data, setData] = useState<DepartureRecommendation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    fetch(`/api/trip-time-optimization?destLat=${lat}&destLng=${lon}`)
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<DepartureRecommendation>; })
      .then((result) => { if (!cancelled) { setData(result); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [lat, lon]);

  return (
    <section className="trip-departure" aria-label="Recommended departure">
      <h3><Clock3 size={16} /> Best time to travel</h3>
      {status === "loading" && <p className="env-loading">Finding the safest departure window...</p>}
      {status === "error" && <p className="env-error">Departure-time forecast unavailable right now.</p>}
      {status === "ready" && data && (
        <>
          <p className="trip-departure-headline">{data.explanation}</p>
          {data.options.length > 0 && (
            <div className="trip-time-table" role="table" aria-label="Departure risk by time">
              <div className="trip-time-row trip-time-head" role="row">
                <span role="columnheader">Departure</span>
                <span role="columnheader">Risk</span>
                <span role="columnheader">Recommendation</span>
              </div>
              {data.options.map((option) => (
                <div key={option.departureTime} className="trip-time-row" role="row">
                  <span role="cell"><time dateTime={option.departureTime}>{formatTime(option.departureTime)}</time></span>
                  <span role="cell" className={`badge ${BADGE_LEVEL[option.riskLevel]}`}>{option.riskLevel}</span>
                  <span role="cell" className={`badge ${BADGE_LEVEL[option.riskLevel]}`}>{option.recommendation}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
