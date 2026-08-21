"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Route, Trash2 } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { RiskRow } from "@/components/risk-row";
import { TripTimeOptimizer } from "@/components/TripTimeOptimizer";

type ShadowProfile = {
  lastLocation?: { coordinates?: [number, number] };
  lastUpdated?: string;
  remainingRoute?: unknown;
  nearestHospital?: { name?: string; location?: { coordinates?: [number, number] } };
  nearestFloodGauge?: { name?: string; location?: { coordinates?: [number, number] } };
};

type RiskHistoryEntry = {
  timestamp: string;
  aqi?: number;
  floodStatus?: string;
  dengueStatus?: string;
  weatherAlert?: string;
  weatherDescription?: string;
  temperature?: number;
  unrestAlert?: string;
  summary?: string;
};

type RiskAlert = { factor: string; previous: string; current: string; createdAt?: string };

type Trip = {
  _id: string;
  destination: string;
  currentRiskBrief?: string;
  updatedAt: string;
  travelDates?: { start?: string; end?: string };
  route?: { distanceMeters?: number; durationSeconds?: number };
  destinationPoint?: [number, number];
  riskHistory?: RiskHistoryEntry[];
  riskAlert?: RiskAlert;
  shadowProfile?: ShadowProfile;
};

const riskTone = (level?: string): "safe" | "caution" | "alert" =>
  level === "None" || level === "Low"
    ? "safe"
    : level === "Watch" || level === "Moderate"
      ? "caution"
      : "alert";
const riskSegments = (level?: string, total = 3) => {
  if (level === "None" || level === "Low") return 1;
  if (level === "Watch" || level === "Moderate") return 2;
  if (level === "High") return 3;
  return total;
};
const aqiLevel = (aqi: number) => {
  if (aqi > 5) return "Low" as const;
  return (
    (
      { 1: "Low", 2: "Low", 3: "Moderate", 4: "High", 5: "Severe" } as Record<
        number,
        "Low" | "Moderate" | "High" | "Severe"
      >
    )[aqi] ?? "Low"
  );
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTrips() {
    setLoading(true);
    try {
      const profile = await apiFetch<{ trips: Trip[] }>("/api/me");
      setTrips(profile.trips);
      setSelectedId((current) =>
        current && profile.trips.some((trip) => trip._id === current)
          ? current
          : (profile.trips[0]?._id ?? null),
      );
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  const [refreshing, setRefreshing] = useState(false);

  async function refreshBrief() {
    if (selectedId) {
      setRefreshing(true);
      try {
        await apiFetch<void>(`/api/trips/${selectedId}/refresh-risk`, { method: "POST" });
      } catch (error) {
        console.error("Failed to refresh risk brief", error);
      } finally {
        setRefreshing(false);
      }
    }
    await loadTrips();
  }

  useEffect(() => {
    if (!getToken()) {
      const timer = window.setTimeout(() => {
        setTrips([]);
        setLoading(false);
      });
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void loadTrips();
    });
    return () => window.clearTimeout(timer);
  }, []);

  async function deleteTrip(id: string) {
    setDeleteTarget(null);
    try {
      await apiFetch<void>(`/api/trips/${id}`, { method: "DELETE" });
      const remaining = (trips ?? []).filter((trip) => trip._id !== id);
      setTrips(remaining);
      setSelectedId((current) => (current === id ? (remaining[0]?._id ?? null) : current));
    } catch (error) {
      console.error("Failed to delete trip", error);
    }
  }

  const [ackTarget, setAckTarget] = useState<Trip | null>(null);

  async function acknowledgeRisk() {
    if (!ackTarget) return;
    const id = ackTarget._id;
    setAckTarget(null);
    try {
      await apiFetch<void>(`/api/trips/${id}/acknowledge`, { method: "POST" });
      setTrips(
        (current) =>
          current?.map((trip) => (trip._id === id ? { ...trip, riskAlert: undefined } : trip)) ??
          [],
      );
      window.dispatchEvent(new Event("risk-alert:ack"));
    } catch (error) {
      console.error("Failed to acknowledge risk", error);
    }
  }

  const selectedTrip = trips?.find((trip) => trip._id === selectedId) ?? null;
  return (
    <RequireAuth>
      <main className="subpage trips-page">
        <header className="subpage-header trips-header">
          <div>
            <p className="eyebrow">Trip history</p>
            <h1>Saved journeys</h1>
            <p>
              Select a journey to review its last saved safety brief, then plan an updated route
              when you are ready.
            </p>
          </div>
          <button
            className="refresh-button"
            onClick={() => void refreshBrief()}
            disabled={loading || refreshing}
          >
            <RefreshCw size={16} className={loading || refreshing ? "spinning" : ""} /> Refresh
          </button>
        </header>
        {loading && <p className="empty-state">Loading your saved journeys...</p>}
        {!loading && trips?.length === 0 && (
          <section className="empty-state trips-empty">
            <Route size={24} />
            <h2>No journeys saved yet</h2>
            <p>Plan a monitored route to keep its safety brief here.</p>
            <Link href="/planner">
              Plan your first route <ArrowRight size={16} />
            </Link>
          </section>
        )}
        {trips && trips.length > 0 && (
          <section className="trip-workspace">
            <div className="trip-list" aria-label="Saved journeys">
              {trips.map((trip) => (
                <button
                  key={trip._id}
                  className={
                    trip.riskAlert
                      ? "trip-card alert"
                      : trip._id === selectedId
                        ? "trip-card selected"
                        : "trip-card"
                  }
                  onClick={() => {
                    setSelectedId(trip._id);
                    if (trip.riskAlert) setAckTarget(trip);
                  }}
                >
                  <span>Updated {new Date(trip.updatedAt).toLocaleDateString()}</span>
                  <strong>{trip.destination.split(",")[0]}</strong>
                  <small>
                    {trip.route?.distanceMeters
                      ? `${(trip.route.distanceMeters / 1000).toFixed(1)} km route`
                      : "Route saved"}
                  </small>
                </button>
              ))}
            </div>{" "}
            {selectedTrip && (
              <article className="trip-detail">
                <p className="eyebrow">Safety brief</p>
                <h2>{selectedTrip.destination}</h2>
                {selectedTrip.travelDates?.start && (
                  <p className="trip-dates">
                    {new Date(selectedTrip.travelDates.start).toLocaleDateString()} to{" "}
                    {selectedTrip.travelDates.end
                      ? new Date(selectedTrip.travelDates.end).toLocaleDateString()
                      : "open"}
                  </p>
                )}
                <p>
                  {selectedTrip.currentRiskBrief ?? "No risk brief was saved for this journey."}
                </p>
                {selectedTrip.destinationPoint && (
                  <TripTimeOptimizer
                    key={selectedTrip._id}
                    lat={selectedTrip.destinationPoint[1]}
                    lon={selectedTrip.destinationPoint[0]}
                  />
                )}
                {selectedTrip.route &&
                  (selectedTrip.route.distanceMeters !== undefined ||
                    selectedTrip.route.durationSeconds !== undefined) && (
                    <div className="trip-route-card" aria-label="Route distance and duration">
                      <span>Route</span>
                      <strong>
                        {selectedTrip.route.distanceMeters !== undefined
                          ? `${Number((selectedTrip.route.distanceMeters / 1000).toFixed(1))} km`
                          : "Route saved"}
                      </strong>
                      <span>·</span>
                      <strong>
                        {selectedTrip.route.durationSeconds !== undefined
                          ? `${Math.round(selectedTrip.route.durationSeconds / 60)} min`
                          : "—"}
                      </strong>
                    </div>
                  )}
                {(() => {
                  const latest = selectedTrip.riskHistory?.length
                    ? selectedTrip.riskHistory[selectedTrip.riskHistory.length - 1]
                    : undefined;
                  if (!latest) return null;
                  const aqi = latest.aqi && latest.aqi <= 5 ? latest.aqi : 2;
                  const aqiLabel = aqiLevel(aqi);
                  return (
                    <section className="trip-conditions" aria-label="Saved risk conditions">
                      <h3>Conditions</h3>
                      <div className="readouts">
                        <RiskRow
                          label="AQI"
                          value={String(aqi)}
                          state={aqiLabel}
                          level={riskTone(aqiLabel)}
                          segments={riskSegments(aqiLabel, 4)}
                          total={4}
                        />
                        <RiskRow
                          label="Flood"
                          value={latest.floodStatus ?? "None"}
                          state={latest.floodStatus ?? "None"}
                          level={riskTone(latest.floodStatus)}
                          segments={riskSegments(latest.floodStatus, 3)}
                          total={3}
                        />
                        <RiskRow
                          label="Dengue"
                          value={latest.dengueStatus ?? "None"}
                          state={latest.dengueStatus ?? "None"}
                          level={riskTone(latest.dengueStatus)}
                          segments={riskSegments(latest.dengueStatus, 3)}
                          total={3}
                        />
                        <RiskRow
                          label="Weather"
                          value={
                            latest.temperature !== undefined
                              ? `${Math.round(latest.temperature)}°`
                              : (latest.weatherAlert ?? "--")
                          }
                          state={latest.weatherAlert ?? latest.weatherDescription ?? "No feed"}
                          level={riskTone(
                            latest.weatherAlert
                              ? "Warning"
                              : latest.weatherDescription
                                ? "Low"
                                : "None",
                          )}
                          segments={latest.weatherAlert ? 3 : latest.weatherDescription ? 1 : 0}
                          total={3}
                        />
                        <RiskRow
                          label="Unrest"
                          value={latest.unrestAlert ? "Alert" : "No alerts"}
                          state={latest.unrestAlert ? "Active" : "None"}
                          level={riskTone(latest.unrestAlert ? "Warning" : "None")}
                          segments={riskSegments(latest.unrestAlert ? "Warning" : "None", 3)}
                          total={3}
                        />
                      </div>
                    </section>
                  );
                })()}
                {selectedTrip.shadowProfile && (
                  <section className="shadow-profile">
                    <h3>Shadow profile</h3>
                    <p>
                      Last reported location:{" "}
                      {selectedTrip.shadowProfile.lastLocation?.coordinates
                        ? `${selectedTrip.shadowProfile.lastLocation.coordinates[1]}, ${selectedTrip.shadowProfile.lastLocation.coordinates[0]}`
                        : "Not available"}
                    </p>
                    <p>
                      Remaining route:{" "}
                      {selectedTrip.shadowProfile.remainingRoute ? "Saved" : "Unknown"}
                    </p>
                    <p>
                      Last updated:{" "}
                      {selectedTrip.shadowProfile.lastUpdated
                        ? new Date(selectedTrip.shadowProfile.lastUpdated).toLocaleString()
                        : "Not yet"}
                    </p>
                    <div className="shadow-profile-details">
                      <div>
                        <strong>Nearest hospital:</strong>
                        <span>
                          {" "}
                          {selectedTrip.shadowProfile.nearestHospital?.name ?? "No nearby hospital"}
                        </span>
                      </div>
                      <div>
                        <strong>Nearest flood gauge:</strong>
                        <span>
                          {" "}
                          {selectedTrip.shadowProfile.nearestFloodGauge?.name ??
                            "No nearby flood gauge"}
                        </span>
                      </div>
                    </div>
                  </section>
                )}
                <div className="trip-detail-actions">
                  <Link href="/">
                    Plan an updated route <ArrowRight size={16} />
                  </Link>
                  <button className="cancel-trip" onClick={() => setDeleteTarget(selectedTrip)}>
                    <Trash2 size={16} /> Cancel trip
                  </button>
                </div>
              </article>
            )}
          </section>
        )}
        {deleteTarget && (
          <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
            <div
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-trip-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="cancel-trip-title">Cancel trip</h3>
              <p>Are you sure you want to delete this trip?</p>
              <div className="confirm-actions">
                <button className="confirm-no" onClick={() => setDeleteTarget(null)}>
                  No
                </button>
                <button className="confirm-yes" onClick={() => void deleteTrip(deleteTarget._id)}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
        {ackTarget && ackTarget.riskAlert && (
          <div className="confirm-overlay" onClick={() => setAckTarget(null)}>
            <div
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ack-risk-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="ack-risk-title">Acknowledge Risk Has Increased!</h3>
              <p>
                {ackTarget.riskAlert.factor} changed to {ackTarget.riskAlert.current} for{" "}
                {ackTarget.destination.split(",")[0]}. Review the updated safety brief, then confirm
                you acknowledge the higher risk.
              </p>
              <div className="confirm-actions">
                <button className="confirm-no" onClick={() => setAckTarget(null)}>
                  No
                </button>
                <button className="confirm-go" onClick={() => void acknowledgeRisk()}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </RequireAuth>
  );
}
