"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QuickConditions, type QuickPlace } from "@/components/landing/QuickConditions";
import type { GlobeDestination } from "@/components/landing/LandingGlobe";

const LandingGlobe = dynamic(
  () => import("@/components/landing/LandingGlobe").then((module) => module.LandingGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="globe-loading" role="status">
        Initializing 3D globe...
      </div>
    ),
  },
);
const RoutingMap = dynamic(
  () => import("@/components/RoutingMap").then((module) => module.RoutingMap),
  {
    ssr: false,
    loading: () => (
      <div className="routing-loading-card" role="status">
        Initializing route planner...
      </div>
    ),
  },
);

const PRESETS: GlobeDestination[] = [
  { id: "dhaka", name: "Dhaka", lat: 23.8103, lon: 90.4125 },
  { id: "chattogram", name: "Chattogram", lat: 22.3569, lon: 91.7832 },
  { id: "sylhet", name: "Sylhet", lat: 24.8949, lon: 91.8687 },
  { id: "cox-bazar", name: "Cox's Bazar", lat: 21.4272, lon: 92.0058 },
  { id: "rajshahi", name: "Rajshahi", lat: 24.3745, lon: 88.6042 },
  { id: "bandarban", name: "Bandarban", lat: 22.1953, lon: 92.2184 },
];
const SEARCH_ID = "search-result";

export default function Home() {
  const [searched, setSearched] = useState<QuickPlace | null>(null);
  const [focus, setFocus] = useState<GlobeDestination | null>(null);

  const handleGlobeSelect = useCallback((destination: GlobeDestination) => {
    setSearched(null);
    setFocus(destination);
  }, []);

  const handleSearch = useCallback(async (place: QuickPlace) => {
    setSearched(place);
    setFocus({ id: SEARCH_ID, name: place.name, lat: place.lat, lon: place.lon });
    try {
      const response = await fetch(`/api/environment?scope=air&lat=${place.lat}&lon=${place.lon}`);
      if (!response.ok) return;
      const environment = (await response.json()) as { current?: { aqi?: number } };
      const aqi = environment.current?.aqi;
      if (aqi === 4 || aqi === 5)
        window.dispatchEvent(
          new CustomEvent("app:aqi-alert", { detail: { destination: place.name, aqi } }),
        );
    } catch {
      // The condition cards retain their own error state when live air data is unavailable.
    }
  }, []);

  const destinations = useMemo<GlobeDestination[]>(
    () =>
      searched
        ? [...PRESETS, { id: SEARCH_ID, name: searched.name, lat: searched.lat, lon: searched.lon }]
        : PRESETS,
    [searched],
  );
  const activeId = focus?.id ?? null;

  return (
    <main className="shell landing-page">
      <div className="wrap">
        <header className="landing-hero">
          <div>
            <p className="eyebrow">NIRAPOD JATRA · Travel safety</p>
            <h1>
              Know the route.
              <br />
              Keep moving.
            </h1>
          </div>
          <p className="lede">
            Weather, air quality, flood, and unrest signals translated into explicit, inspectable
            safety rules. Check any destination below or jump straight into full route planning — no
            account needed.
          </p>
        </header>
        <section className="landing-globe-section">
          <div className="landing-globe-panel bracket">
            <LandingGlobe
              destinations={destinations}
              focus={focus}
              activeId={activeId}
              onSelect={handleGlobeSelect}
            />
          </div>
          <QuickConditions onDestinationSelected={handleSearch} />
        </section>
        <section className="landing-navigation" aria-label="Live route navigation">
          <RoutingMap />
        </section>
        <section className="landing-cta">
          <div>
            <p className="eyebrow">Full route planner</p>
            <h2>Save monitored journeys</h2>
            <p>
              Sign in to save trips, set check-in timers, and keep a shadow profile for emergencies.
            </p>
          </div>
          <Link href="/planner" className="landing-cta-button">
            Open route planner <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </main>
  );
}
