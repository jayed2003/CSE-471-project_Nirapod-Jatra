"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  Compass,
  Landmark,
  Palette,
  RefreshCw,
  Sparkles,
  Ticket,
  TreePine,
  Trees,
} from "lucide-react";
import { cacheValue, readCachedValue } from "@/lib/offline";

type AttractionCategory = "landmark" | "museum" | "nature" | "park" | "entertainment";
type TouristAttraction = { id: string; name: string; category: AttractionCategory; kind: string };
type Place = { lat: number; lon: number; displayName: string };
type AttractionsResponse = {
  attractions: TouristAttraction[];
  degraded: boolean;
  bestTimeToVisit: { text: string; source: "gemini" | "fallback" };
};

const CATEGORY_ICON: Record<AttractionCategory, typeof Landmark> = {
  landmark: Landmark,
  museum: Palette,
  nature: TreePine,
  park: Trees,
  entertainment: Ticket,
};

const SECTIONS: Array<{ label: string; categories: AttractionCategory[] }> = [
  { label: "Landmarks & history", categories: ["landmark"] },
  { label: "Museums & galleries", categories: ["museum"] },
  { label: "Parks & nature", categories: ["nature", "park"] },
  { label: "Entertainment & recreation", categories: ["entertainment"] },
];

const MAX_PER_SECTION = 10;

export function TouristExplorer() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [result, setResult] = useState<AttractionsResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAttractions(targetPlace: Place) {
    const attractionsResponse = await fetch(
      `/api/attractions?lat=${targetPlace.lat}&lon=${targetPlace.lon}&destination=${encodeURIComponent(targetPlace.displayName)}`,
    );
    if (!attractionsResponse.ok)
      throw new Error("Could not load attractions for this destination.");
    setResult((await attractionsResponse.json()) as AttractionsResponse);
  }

  async function explore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = query.trim();
    if (!destination) return;
    setStatus("loading");
    setError("");
    try {
      const cacheKey = `geocode:v2:${destination.toLowerCase()}`;
      let resolvedPlace = await readCachedValue<Place>(cacheKey);
      if (!resolvedPlace) {
        const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(destination)}`);
        if (geocodeResponse.status === 404)
          throw new Error(
            "Destination not found. Try a different spelling or a larger nearby city.",
          );
        if (!geocodeResponse.ok)
          throw new Error("Location service is unavailable. Please try again.");
        resolvedPlace = (await geocodeResponse.json()) as Place;
        await cacheValue(cacheKey, resolvedPlace);
      }
      setPlace(resolvedPlace);
      await loadAttractions(resolvedPlace);
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to explore this destination.");
      setStatus("error");
    }
  }

  async function retry() {
    if (!place || refreshing) return;
    setRefreshing(true);
    try {
      await loadAttractions(place);
    } catch {
      /* keep showing the previous result */
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="explorer-card">
      <div className="explorer-heading">
        <div>
          <p className="eyebrow">Smart tourist explorer</p>
          <h2>Discover attractions</h2>
          <p>
            Enter a city or destination to find its popular tourist attractions and the best time to
            visit.
          </p>
        </div>
      </div>
      <form onSubmit={(event) => void explore(event)} className="explorer-search">
        <Compass size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="City or destination"
          required
        />
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Exploring..." : "Explore"}
        </button>
      </form>
      {status === "error" && <p className="services-status">{error}</p>}
      {status === "ready" && place && result && (
        <>
          <p className="services-status">
            Popular attractions in {place.displayName.split(",")[0]}.
          </p>
          {result.degraded && (
            <p className="services-status services-degraded">
              Live lookup was slow and results may be incomplete — this is not a confirmed
              &quot;nothing found&quot;.
              <button
                type="button"
                className="text-button"
                onClick={() => void retry()}
                disabled={refreshing}
              >
                <RefreshCw size={13} /> {refreshing ? "Retrying..." : "Retry"}
              </button>
            </p>
          )}
          <div className="best-time-card">
            <Sparkles size={18} />
            <p>{result.bestTimeToVisit.text}</p>
          </div>
          {result.attractions.length === 0 && (
            <p className="services-empty">
              No well-known attractions found for {place.displayName.split(",")[0]} yet. Try a
              larger nearby city.
            </p>
          )}
          {result.attractions.length > 0 && (
            <div className="services-groups">
              {SECTIONS.map((section) => {
                const items = result.attractions.filter((attraction) =>
                  section.categories.includes(attraction.category),
                );
                if (items.length === 0) return null;
                return (
                  <section key={section.label} className="services-group">
                    <h3>{section.label}</h3>
                    <ul>
                      {items.slice(0, MAX_PER_SECTION).map((attraction) => {
                        const Icon = CATEGORY_ICON[attraction.category];
                        return (
                          <li key={attraction.id}>
                            <div className="service-name">
                              <Icon size={15} />
                              <strong>{attraction.name}</strong>
                              <span>{attraction.kind}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
