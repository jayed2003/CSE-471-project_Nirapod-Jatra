"use client";

import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { cacheValue, readCachedValue } from "@/lib/offline";
import { WeatherCard } from "@/components/WeatherCard";
import { AirQualityCard } from "@/components/AirQualityCard";
import { ForecastCard } from "@/components/ForecastCard";
import { AirQualityForecastCard } from "@/components/AirQualityForecastCard";

export type QuickPlace = { name: string; lat: number; lon: number };
type PlaceResult = { lat: number; lon: number; displayName: string };

type Props = { onDestinationSelected: (place: QuickPlace) => void | Promise<void> };

export function QuickConditions({ onDestinationSelected }: Props) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<QuickPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    "Search any destination for its live weather and air quality. No account needed, and nothing is saved.",
  );

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    setMessage("Looking up destination...");
    try {
      const cacheKey = `geocode:v2:${trimmed.toLowerCase()}`;
      let result = await readCachedValue<PlaceResult>(cacheKey);
      if (!result) {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        if (response.status === 404) throw new Error("Destination not found.");
        if (!response.ok) throw new Error("Please check your internet connection.");
        result = (await response.json()) as PlaceResult;
        await cacheValue(cacheKey, result);
      }
      const nextPlace = {
        name: result.displayName.split(",")[0],
        lat: result.lat,
        lon: result.lon,
      };
      setPlace(nextPlace);
      void onDestinationSelected(nextPlace);
      setMessage(`Live conditions for ${result.displayName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load this destination.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="quick-conditions"
      id="quick-search"
      aria-label="Quick destination conditions"
    >
      <div className="quick-heading">
        <div>
          <p className="eyebrow">Quick destination check</p>
          <h2>Where are you going?</h2>
        </div>
        <p>{message}</p>
      </div>
      <form onSubmit={search} className="quick-search-form">
        <div className="search-row">
          <MapPin size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, station, or address"
            required
            aria-label="Destination"
          />
          <button type="submit">
            {loading ? "Searching..." : "Check conditions"} <ArrowRight size={16} />
          </button>
        </div>
      </form>
      {place && (
        <div
          className="environment-grid landing-environment-grid"
          aria-label={`Live environmental conditions for ${place.name}`}
        >
          <WeatherCard key={`weather-${place.lat}-${place.lon}`} lat={place.lat} lon={place.lon} />
          <AirQualityCard key={`air-${place.lat}-${place.lon}`} lat={place.lat} lon={place.lon} />
          <ForecastCard
            key={`forecast-${place.lat}-${place.lon}`}
            lat={place.lat}
            lon={place.lon}
          />
          <AirQualityForecastCard
            key={`air-forecast-${place.lat}-${place.lon}`}
            lat={place.lat}
            lon={place.lon}
          />
        </div>
      )}
    </section>
  );
}
