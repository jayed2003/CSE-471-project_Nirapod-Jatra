"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, MapPin } from "lucide-react";
import { cacheValue, readCachedValue } from "@/lib/offline";
import { WeatherCard } from "@/components/WeatherCard";
import { AirQualityCard } from "@/components/AirQualityCard";
import { TravelRecommendationDialog } from "@/components/TravelRecommendationDialog";
import { apiFetch, getToken } from "@/lib/api-client";

const RoutingMap = dynamic(() => import("@/components/RoutingMap").then((module) => module.RoutingMap), {
  ssr: false,
  loading: () => <div className="routing-loading-card" role="status">Initializing route planner...</div>,
});
const ForecastCard = dynamic(() => import("@/components/ForecastCard").then((module) => module.ForecastCard), { ssr: false, loading: () => <div className="env-card env-loading">Loading outlook...</div> });
const AirQualityForecastCard = dynamic(() => import("@/components/AirQualityForecastCard").then((module) => module.AirQualityForecastCard), { ssr: false, loading: () => <div className="env-card env-loading">Loading AQI forecast...</div> });

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
type Place = { display_name: string; lon: string; lat: string };
type Environment = { weather?: { current?: { temperature: number; description: string } }; air?: { current?: { aqi: number; label: string } } };

function currentPosition() {
  if (!navigator.geolocation) return Promise.resolve<GeolocationPosition | null>(null);
  return new Promise<GeolocationPosition | null>((resolve) => {
    let settled = false;
    const finish = (position: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(position);
    };
    const timeout = window.setTimeout(() => finish(null), 5_000);
    navigator.geolocation.getCurrentPosition((position) => finish(position), () => finish(null), { maximumAge: 60_000, timeout: 4_500 });
  });
}

function destinationSummary(environment: Environment) {
  const air = environment.air?.current;
  const weather = environment.weather?.current;
  const airText = air ? `AQI ${air.aqi} (${air.label})` : "air quality unavailable";
  const weatherText = weather ? `${weather.description.toLowerCase()}, ${Math.round(weather.temperature)} C` : "weather unavailable";
  return `Live destination conditions: ${airText}; ${weatherText}. Flood, dengue, and unrest feeds are not available for this destination.`;
}

export default function Home() {
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [returnDate, setReturnDate] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a destination and travel dates to load its route conditions.");
  const [checkIn, setCheckIn] = useState("Not scheduled");
  const [mapLocation, setMapLocation] = useState<{ center: [number, number]; label: string } | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [travelDialogOpen, setTravelDialogOpen] = useState(false);
  const [travelBrief, setTravelBrief] = useState<string | null>(null);
  const [travelBriefLoading, setTravelBriefLoading] = useState(false);

  useEffect(() => {
    if (!activeTripId || !getToken() || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((position) => {
      void apiFetch(`/api/trips/${activeTripId}/shadow-profile`, { method: "PUT", body: JSON.stringify({ location: { type: "Point", coordinates: [position.coords.longitude, position.coords.latitude] } }) }).catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeTripId]);

  async function assessRoute(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Finding destination and route...");
    setEnvironment(null);
    try {
      if (!getToken()) throw new Error("Sign in or create an account before saving a trip");
      const cacheKey = `geocode:${destination.toLowerCase()}`;
      let place = await readCachedValue<Place>(cacheKey);
      if (!place) {
        const result = await fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(destination)}`);
        if (!result.ok) throw new Error("Location service is unavailable");
        place = (await result.json()) as Place | null;
        if (!place) throw new Error("Destination not found");
        await cacheValue(cacheKey, place);
      }
      const position = await currentPosition();
      const payload = { destination: place.display_name, origin: position ? [position.coords.longitude, position.coords.latitude] as [number, number] : undefined, destinationPoint: [Number(place.lon), Number(place.lat)] as [number, number], travelDates: { start: departureDate, end: returnDate } };
      const trip = await apiFetch<{ _id: string; currentRiskBrief: string; route?: { distanceMeters?: number; durationSeconds?: number } }>("/api/trips", { method: "POST", body: JSON.stringify(payload) });
      await cacheValue("trip", trip);
      setActiveTripId(trip._id);
      const location = { center: payload.destinationPoint, label: place.display_name };
      setMapLocation(location);
      setStatus(trip.currentRiskBrief);
      setTravelDialogOpen(true); setTravelBrief(null); setTravelBriefLoading(true);
      const [weatherResult, airResult] = await Promise.allSettled([
        fetch(`/api/environment?scope=weather&lat=${payload.destinationPoint[1]}&lon=${payload.destinationPoint[0]}`).then((result) => result.ok ? result.json() : null),
        fetch(`/api/environment?scope=air&lat=${payload.destinationPoint[1]}&lon=${payload.destinationPoint[0]}`).then((result) => result.ok ? result.json() : null),
      ]);
      const nextEnvironment: Environment = { weather: weatherResult.status === "fulfilled" ? weatherResult.value : undefined, air: airResult.status === "fulfilled" ? airResult.value : undefined };
      setEnvironment(nextEnvironment);
      setStatus(destinationSummary(nextEnvironment));
      const routeDistance = trip.route;
      const briefResponse = await fetch("/api/travel-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: place.display_name, distanceKm: routeDistance?.distanceMeters ? Number((routeDistance.distanceMeters / 1000).toFixed(1)) : undefined, durationMin: routeDistance?.durationSeconds ? Math.round(routeDistance.durationSeconds / 60) : undefined, temperature: nextEnvironment.weather?.current?.temperature, weather: nextEnvironment.weather?.current?.description, aqi: nextEnvironment.air?.current?.aqi, aqiLabel: nextEnvironment.air?.current?.label }) });
      if (briefResponse.ok) setTravelBrief((await briefResponse.json() as { brief: string }).brief);
      setTravelBriefLoading(false);
    } catch (error) {
      setStatus(error instanceof Error ? `${error.message}. Please try again.` : "Unable to plan this route. Please try again.");
    }
  }

  function resetCheckIn() {
    const deadline = new Date(Date.now() + 6 * 60 * 60 * 1000);
    setCheckIn(`Next check-in: ${deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }

  return (
    <main className="shell">
      <div className="wrap">
      <header className="topbar"><div><div className="brand">NIRAPOD JATRA</div><p className="eyebrow">Travel safety</p></div><div className="monitoring"><span /> Monitoring active</div></header>
      <section className="route-panel">
        <div><p className="eyebrow">Route planning</p><h1>Know the route.<br />Keep moving.</h1><p className="lede">Weather, air quality, flood, and unrest signals translated into explicit, inspectable safety rules, not a black box.</p></div>
        <form onSubmit={assessRoute} className="route-form bracket"><label htmlFor="destination">Where are you going?</label><div className="search-row"><MapPin size={18} /><input id="destination" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="City, station, or address" required /><button type="submit">Plan <ArrowRight size={16} /></button></div><div className="date-row"><label>Departure<input value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} type="date" min={new Date().toISOString().slice(0, 10)} required /></label><label>Return<input value={returnDate} onChange={(event) => setReturnDate(event.target.value)} type="date" min={departureDate} required /></label></div></form>
      </section>
      <section className="dashboard">
        <article className="panel conditions"><h2>Conditions · {mapLocation ? `${mapLocation.label.split(",")[0]} route` : "Awaiting destination"}</h2>{environment ? <div className="readouts"><RiskRow label="AQI" value={environment.air?.current?.aqi?.toString() ?? "--"} state={environment.air?.current?.label ?? "Unavailable"} level={environment.air?.current && environment.air.current.aqi > 2 ? "caution" : "safe"} segments={environment.air?.current ? Math.min(environment.air.current.aqi, 5) : 0} /><RiskRow label="Flood" value="--" state="No live feed" level="safe" segments={0} /><RiskRow label="Dengue" value="--" state="No live feed" level="safe" segments={0} /><RiskRow label="Weather" value={environment.weather?.current ? `${Math.round(environment.weather.current.temperature)}°` : "--"} state={environment.weather?.current?.description ?? "Unavailable"} level="safe" segments={environment.weather?.current ? 1 : 0} /><RiskRow label="Unrest" value="--" state="No live feed" level="safe" segments={0} /></div> : <p className="conditions-empty">Live weather and air quality appear here after you plan a destination.</p>}<div className="brief"><p>{status}</p><span>Daily risk checks send an update only when conditions change · saved briefs stay available offline for 30 days</span></div></article>
        <div className="right-column"><article className="panel checkin bracket"><h2>Check on me</h2><div className="timer-readout">{checkIn === "Not scheduled" ? "00:00:00" : checkIn.replace("Next check-in: ", "")}</div><p>{checkIn === "Not scheduled" ? "Not scheduled" : "Timer active"}</p><button onClick={resetCheckIn}>Set 6-hour timer</button></article></div>
      </section>
      <RoutingMap />
      {mapLocation && <section className="environment-grid" aria-label={`Live environmental conditions for ${mapLocation.label}`}>
        <WeatherCard key={`weather-${mapLocation.center.join(",")}`} lat={mapLocation.center[1]} lon={mapLocation.center[0]} />
        <AirQualityCard key={`air-${mapLocation.center.join(",")}`} lat={mapLocation.center[1]} lon={mapLocation.center[0]} />
        <ForecastCard key={`forecast-${mapLocation.center.join(",")}`} lat={mapLocation.center[1]} lon={mapLocation.center[0]} />
        <AirQualityForecastCard key={`air-forecast-${mapLocation.center.join(",")}`} lat={mapLocation.center[1]} lon={mapLocation.center[0]} />
      </section>}
      <TravelRecommendationDialog open={travelDialogOpen} context={mapLocation ? { destination: mapLocation.label, temperature: environment?.weather?.current?.temperature, weather: environment?.weather?.current?.description, aqi: environment?.air?.current?.aqi, aqiLabel: environment?.air?.current?.label } : null} brief={travelBrief} loading={travelBriefLoading} onClose={() => setTravelDialogOpen(false)} />
      </div>
    </main>
  );
}

function RiskRow({ label, value, state, level, segments }: { label: string; value: string; state: string; level: "safe" | "caution" | "alert"; segments: number }) {
  return <div className="risk-row"><span className="risk-label">{label}</span><div className="risk-bar">{[1, 2, 3, 4, 5].map((segment) => <span key={segment} className={segment <= segments ? `active ${level}` : ""} />)}</div><strong>{value}</strong><span className={`badge ${level}`}>{state}</span></div>;
}
