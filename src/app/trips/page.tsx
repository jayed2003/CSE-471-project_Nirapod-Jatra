"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Route } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-client";

type Trip = { _id: string; destination: string; currentRiskBrief?: string; updatedAt: string; travelDates?: { start?: string; end?: string }; route?: { distanceMeters?: number; durationSeconds?: number } };

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTrips() {
    setLoading(true);
    try {
      const profile = await apiFetch<{ trips: Trip[] }>("/api/me");
      setTrips(profile.trips);
      setSelectedId((current) => current && profile.trips.some((trip) => trip._id === current) ? current : profile.trips[0]?._id ?? null);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      const timer = window.setTimeout(() => { setTrips([]); setLoading(false); });
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => { void loadTrips(); });
    return () => window.clearTimeout(timer);
  }, []);

  const selectedTrip = trips?.find((trip) => trip._id === selectedId) ?? null;
  return <main className="subpage trips-page"><header className="subpage-header trips-header"><div><p className="eyebrow">Trip history</p><h1>Saved journeys</h1><p>Select a journey to review its last saved safety brief, then plan an updated route when you are ready.</p></div><button className="refresh-button" onClick={() => void loadTrips()} disabled={loading}><RefreshCw size={16} className={loading ? "spinning" : ""} /> Refresh</button></header>{loading && <p className="empty-state">Loading your saved journeys...</p>}{!loading && trips?.length === 0 && <section className="empty-state trips-empty"><Route size={24} /><h2>No journeys saved yet</h2><p>Plan a monitored route to keep its safety brief here.</p><Link href="/">Plan your first route <ArrowRight size={16} /></Link></section>}{trips && trips.length > 0 && <section className="trip-workspace"><div className="trip-list" aria-label="Saved journeys">{trips.map((trip) => <button key={trip._id} className={trip._id === selectedId ? "trip-card selected" : "trip-card"} onClick={() => setSelectedId(trip._id)}><span>Updated {new Date(trip.updatedAt).toLocaleDateString()}</span><strong>{trip.destination.split(",")[0]}</strong><small>{trip.route?.distanceMeters ? `${(trip.route.distanceMeters / 1000).toFixed(1)} km route` : "Route saved"}</small></button>)}</div>{selectedTrip && <article className="trip-detail"><p className="eyebrow">Safety brief</p><h2>{selectedTrip.destination}</h2>{selectedTrip.travelDates?.start && <p className="trip-dates">{new Date(selectedTrip.travelDates.start).toLocaleDateString()} to {selectedTrip.travelDates.end ? new Date(selectedTrip.travelDates.end).toLocaleDateString() : "open"}</p>}<p>{selectedTrip.currentRiskBrief ?? "No risk brief was saved for this journey."}</p><Link href="/">Plan an updated route <ArrowRight size={16} /></Link></article>}</section>}</main>;
}
