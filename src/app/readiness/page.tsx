"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, Download, MapPin, RefreshCw, Route, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { ReadinessMap } from "@/components/ReadinessMap";
import { countCachedTiles, primeOfflineMap } from "@/lib/offline";

type Trip = { _id: string; destination: string; travelDates?: { start?: string; end?: string }; route?: { geometry?: { coordinates?: Array<[number, number]> } } };

type ReadinessWarning = { provider: "bmd" | "bwdb"; event: string; severity: string; status: string; headline: string; area?: string; expires?: string; distanceKm: number; matchedAt: [number, number]; polygon?: Array<[number, number]> };

type ReadinessReport = {
  status: "ready" | "escalated";
  source: "bmd" | "bwdb" | "bmd+bwdb" | null;
  warnings: ReadinessWarning[];
  nearestShelter: { name: string; point: [number, number]; distanceKm: number; source?: string } | null;
  offlineMap: { status?: "pending" | "downloaded"; zoom: number; tileCount: number; tiles: string[] };
  checkedAt: string;
};

async function fetchReport(tripId: string): Promise<ReadinessReport> {
  return apiFetch<ReadinessReport>(`/api/trips/${encodeURIComponent(tripId)}/readiness`);
}

export default function ReadinessPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!getToken()) { if (!cancelled) { setTrips([]); setLoading(false); } return; }
      void (async () => {
        try {
          const profile = await apiFetch<{ trips: Trip[] }>("/api/me");
          if (cancelled) return;
          setTrips(profile.trips);
          const active = profile.trips.find((trip) => trip.travelDates?.end && new Date(trip.travelDates.end) >= new Date());
          setSelectedId((current) => current && profile.trips.some((trip) => trip._id === current) ? current : active?._id ?? profile.trips[0]?._id ?? null);
        } catch { if (!cancelled) setTrips([]); } finally { if (!cancelled) setLoading(false); }
      })();
    });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = async () => {
      try { const next = await fetchReport(selectedId); if (!cancelled) { setReport(next); setError(null); } } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Readiness check failed"); }
    };
    void load();
    const timer = window.setInterval(() => { if (!cancelled) void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedId]);

  const selectedTrip = trips?.find((trip) => trip._id === selectedId) ?? null;
  const warningPolygons = report?.warnings.flatMap((warning) => warning.polygon ? [warning.polygon] : []) ?? [];

  async function downloadOffline() {
    if (!report || !selectedId || progress) return;
    const tiles = report.offlineMap.tiles;
    setProgress({ loaded: 0, total: tiles.length });
    await primeOfflineMap(tiles, (loaded, total) => setProgress({ loaded, total }));
    try { await apiFetch(`/api/trips/${encodeURIComponent(selectedId)}/readiness/offline`, { method: "POST" }); } catch { }
    setOfflineReady(true);
    setProgress(null);
  }

  useEffect(() => {
    if (!report || !selectedId || report.offlineMap.tileCount === 0) return;
    let cancelled = false;
    void countCachedTiles(report.offlineMap.tiles).then((cached) => { if (!cancelled) setOfflineReady(cached === report.offlineMap.tileCount); });
    return () => { cancelled = true; };
  }, [report, selectedId]);

  return <RequireAuth><main className="subpage readiness-page"><header className="subpage-header readiness-header"><div><p className="eyebrow">Emergency readiness</p><h1>Route readiness</h1><p>When BWDB or BMD issues a warning near a saved route, readiness escalates automatically and the offline map is pre-downloaded with the nearest shelter.</p></div><button className="refresh-button" onClick={() => { if (selectedId) void (async () => { setRefreshing(true); try { const next = await fetchReport(selectedId); setReport(next); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Readiness check failed"); } finally { setRefreshing(false); } })(); }} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spinning" : ""} /> Refresh</button></header>{loading && <p className="empty-state">Loading saved routes...</p>}{!loading && trips?.length === 0 && <section className="empty-state readiness-empty"><Route size={24} /><h2>No saved routes</h2><p>Plan a monitored route so it can be pre-checked for warnings and made ready offline.</p><Link href="/planner">Plan your first route <ArrowRight size={16} /></Link></section>}{trips && trips.length > 0 && <section className="readiness-workspace"><div className="readiness-trip-list" aria-label="Choose a route">{trips.map((trip) => <button key={trip._id} className={trip._id === selectedId ? "readiness-trip selected" : "readiness-trip"} onClick={() => setSelectedId(trip._id)}><strong>{trip.destination.split(",")[0]}</strong><span>{trip.travelDates?.end && new Date(trip.travelDates.end) >= new Date() ? "Active" : "Past"}</span></button>)}</div>{selectedTrip && <div className="readiness-grid">{error && <p className="readiness-error"><TriangleAlert size={14} /> {error}</p>}{report && <><article className={`readiness-status ${report.status}`}><div className="readiness-status-icon">{report.status === "escalated" ? <ShieldAlert size={30} /> : <ShieldCheck size={30} />}</div><div><p className="eyebrow">Auto-escalated readiness</p><h2>{report.status === "escalated" ? "Escalated" : "Ready"}</h2><p>{report.status === "escalated" ? `${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"} affect this route. Offline map and shelter are prepared.` : "No active warnings near this route. Offline map is available on request."}</p>{report.source && <span className="badge alert">Sources: {report.source}</span>}<small>Checked {new Date(report.checkedAt).toLocaleTimeString()}</small></div></article><div className="readiness-warnings">{report.warnings.length === 0 && <p className="readiness-none">No BWDB flood or BMD weather warnings intersect your route right now.</p>}{report.warnings.map((warning, index) => <article key={`${warning.provider}-${index}`} className={`warning-card ${warning.status === "Warning" ? "alert" : "caution"}`}><div className="warning-heading"><span className={`badge ${warning.status === "Warning" ? "alert" : "caution"}`}>{warning.provider === "bmd" ? "BMD weather" : "BWDB flood"}</span><strong>{warning.event} · {warning.severity}</strong></div><p>{warning.headline}</p><footer><span>{warning.area}</span><span>{warning.provider === "bmd" ? "Route passes through warned area" : `${warning.distanceKm} km from route`}</span>{warning.expires && <span>Expires {new Date(warning.expires).toLocaleString()}</span>}</footer></article>)}</div><div className="readiness-side"><article className="readiness-shelter"><MapPin size={22} /><h3>Nearest shelter</h3>{report.nearestShelter ? <><strong>{report.nearestShelter.name}</strong><span>{report.nearestShelter.distanceKm.toFixed(1)} km from route · {report.nearestShelter.source === "fallback" ? "curated fallback" : "live OpenStreetMap"}</span><a href={`https://www.openstreetmap.org/?mlat=${report.nearestShelter.point[1]}&mlon=${report.nearestShelter.point[0]}#map=15/${report.nearestShelter.point[1]}/${report.nearestShelter.point[0]}`} target="_blank" rel="noreferrer">Open in map <ArrowRight size={14} /></a></> : <p>No shelter found near this route.</p>}</article><article className="readiness-offline"><CloudOff size={22} /><h3>Offline map</h3><p>{report.offlineMap.tileCount} map tiles pre-selected for this route at zoom {report.offlineMap.zoom}.</p>{offlineReady || report.offlineMap.status === "downloaded" ? <p className="offline-ready">Offline map is downloaded and cached. It stays available even without a connection.</p> : <button onClick={() => void downloadOffline()} disabled={Boolean(progress) || report.offlineMap.tileCount === 0}><Download size={16} /> Pre-download offline map</button>}{progress && <div className="offline-progress" role="progressbar" aria-valuenow={progress.loaded} aria-valuemax={progress.total}><span style={{ width: `${Math.round(progress.loaded / Math.max(1, progress.total) * 100)}%` }} /></div>}{progress && <small>{progress.loaded} / {progress.total} tiles cached</small>}</article><div className="readiness-map-card"><ReadinessMap route={selectedTrip.route?.geometry} polygons={warningPolygons} shelter={report.nearestShelter} /></div></div></>}</div>}</section>}</main></RequireAuth>;
}
