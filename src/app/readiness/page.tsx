"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, Download, MapPin, RefreshCw, Route, ShieldAlert, ShieldCheck, TriangleAlert, WifiOff } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { ReadinessMap } from "@/components/ReadinessMap";
import { countCachedTiles, primeOfflineMap, cacheValue, readCachedValue } from "@/lib/offline";
import { writeZonePack, readZonePack } from "@/lib/lowNetworkZones";
import { PremiumGate } from "@/components/PremiumGate";
import type { Plan } from "@/lib/plan";

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

type ZonePersonalContact = { name: string; phone: string; email: string; priority: number };
type ZoneNearbyService = { id: string; name: string; category: string; point: [number, number]; distanceMeters: number; phones: string[] };
type ZonePack = {
  zone: { id: string; name: string; region: string; description: string; polygon: Array<[number, number]>; centroid: [number, number] };
  offlineMap: { status: "pending" | "downloaded"; zoom: number; tileCount: number; tiles: string[] };
  emergencyBundle: { personalContacts: ZonePersonalContact[]; nearbyServices: { services: ZoneNearbyService[]; degraded: boolean } };
};

async function fetchReport(tripId: string): Promise<ReadinessReport> {
  return apiFetch<ReadinessReport>(`/api/trips/${encodeURIComponent(tripId)}/readiness`);
}

async function fetchZones(tripId: string): Promise<{ zones: ZonePack[] }> {
  return apiFetch<{ zones: ZonePack[] }>(`/api/trips/${encodeURIComponent(tripId)}/low-network-zones`);
}

function reportCacheKey(tripId: string) {
  return `readiness-report:${tripId}`;
}

export default function ReadinessPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [reportOffline, setReportOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [zones, setZones] = useState<ZonePack[]>([]);
  const [zoneProgress, setZoneProgress] = useState<Record<string, { loaded: number; total: number }>>({});
  const [zoneReady, setZoneReady] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<Plan | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    function loadPlan() {
      if (!getToken()) return;
      apiFetch<{ user: { plan?: Plan } }>("/api/me").then((profile) => { if (!cancelled) setPlan(profile.user.plan ?? "basic"); }).catch(() => undefined);
    }
    loadPlan();
    window.addEventListener("plan:changed", loadPlan);
    return () => { cancelled = true; window.removeEventListener("plan:changed", loadPlan); };
  }, []);

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
      try {
        const next = await fetchReport(selectedId);
        if (cancelled) return;
        setReport(next);
        setReportOffline(false);
        setError(null);
        void cacheValue(reportCacheKey(selectedId), next);
      } catch (cause) {
        if (cancelled) return;
        const cached = await readCachedValue<ReadinessReport>(reportCacheKey(selectedId));
        if (cached) { setReport(cached); setReportOffline(true); setError(null); }
        else setError(cause instanceof Error ? cause.message : "Readiness check failed");
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!cancelled) void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) { setZones([]); return; }
    let cancelled = false;
    fetchZones(selectedId).then((result) => { if (!cancelled) setZones(result.zones); }).catch(() => { if (!cancelled) setZones([]); });
    return () => { cancelled = true; };
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

  async function downloadZonePack(zonePack: ZonePack) {
    if (!selectedId || zoneProgress[zonePack.zone.id]) return;
    const tiles = zonePack.offlineMap.tiles;
    setZoneProgress((current) => ({ ...current, [zonePack.zone.id]: { loaded: 0, total: tiles.length } }));
    await primeOfflineMap(tiles, (loaded, total) => setZoneProgress((current) => ({ ...current, [zonePack.zone.id]: { loaded, total } })));
    await writeZonePack(selectedId, zonePack.zone.id, {
      zoneName: zonePack.zone.name,
      region: zonePack.zone.region,
      personalContacts: zonePack.emergencyBundle.personalContacts,
      nearbyServices: zonePack.emergencyBundle.nearbyServices.services,
      degraded: zonePack.emergencyBundle.nearbyServices.degraded,
      tiles,
      cachedAt: new Date().toISOString(),
    });
    try {
      await apiFetch(`/api/trips/${encodeURIComponent(selectedId)}/low-network-zones/${encodeURIComponent(zonePack.zone.id)}/offline`, {
        method: "POST",
        body: JSON.stringify({
          zoneName: zonePack.zone.name,
          zoom: zonePack.offlineMap.zoom,
          tileCount: zonePack.offlineMap.tileCount,
          tiles,
          servicesCount: zonePack.emergencyBundle.nearbyServices.services.length,
          degraded: zonePack.emergencyBundle.nearbyServices.degraded,
          personalContactsCount: zonePack.emergencyBundle.personalContacts.length,
        }),
      });
    } catch { }
    setZoneReady((current) => ({ ...current, [zonePack.zone.id]: true }));
    setZoneProgress((current) => { const next = { ...current }; delete next[zonePack.zone.id]; return next; });
  }

  useEffect(() => {
    if (!report || !selectedId || report.offlineMap.tileCount === 0) return;
    let cancelled = false;
    void countCachedTiles(report.offlineMap.tiles).then((cached) => { if (!cancelled) setOfflineReady(cached === report.offlineMap.tileCount); });
    return () => { cancelled = true; };
  }, [report, selectedId]);

  useEffect(() => {
    if (!selectedId || zones.length === 0) return;
    let cancelled = false;
    void Promise.all(zones.map(async (zonePack) => {
      const [cachedTiles, cachedPack] = await Promise.all([countCachedTiles(zonePack.offlineMap.tiles), readZonePack(selectedId, zonePack.zone.id)]);
      return [zonePack.zone.id, (cachedTiles === zonePack.offlineMap.tileCount && zonePack.offlineMap.tileCount > 0) || Boolean(cachedPack)] as const;
    })).then((entries) => { if (!cancelled) setZoneReady(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [zones, selectedId]);

  if (plan === undefined) return <RequireAuth><main className="subpage"><p className="auth-loading">Checking your plan...</p></main></RequireAuth>;

  return <RequireAuth><PremiumGate plan={plan} feature="Route readiness"><main className="subpage readiness-page"><header className="subpage-header readiness-header"><div><p className="eyebrow">Emergency readiness</p><h1>Route readiness</h1><p>When BWDB or BMD issues a warning near a saved route, readiness escalates automatically and the offline map is pre-downloaded with the nearest shelter.</p></div><button className="refresh-button" onClick={() => { if (selectedId) void (async () => { setRefreshing(true); try { const next = await fetchReport(selectedId); setReport(next); setReportOffline(false); setError(null); void cacheValue(reportCacheKey(selectedId), next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Readiness check failed"); } finally { setRefreshing(false); } })(); }} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spinning" : ""} /> Refresh</button></header>{loading && <p className="empty-state">Loading saved routes...</p>}{!loading && trips?.length === 0 && <section className="empty-state readiness-empty"><Route size={24} /><h2>No saved routes</h2><p>Plan a monitored route so it can be pre-checked for warnings and made ready offline.</p><Link href="/planner">Plan your first route <ArrowRight size={16} /></Link></section>}{trips && trips.length > 0 && <section className="readiness-workspace"><div className="readiness-trip-list" aria-label="Choose a route">{trips.map((trip) => <button key={trip._id} className={trip._id === selectedId ? "readiness-trip selected" : "readiness-trip"} onClick={() => setSelectedId(trip._id)}><strong>{trip.destination.split(",")[0]}</strong><span>{trip.travelDates?.end && new Date(trip.travelDates.end) >= new Date() ? "Active" : "Past"}</span></button>)}</div>{selectedTrip && <div className="readiness-grid">{error && <p className="readiness-error"><TriangleAlert size={14} /> {error}</p>}{reportOffline && <p className="readiness-error offline-notice"><WifiOff size={14} /> Showing the last downloaded readiness report — you appear to be offline.</p>}{report && <><article className={`readiness-status ${report.status}`}><div className="readiness-status-icon">{report.status === "escalated" ? <ShieldAlert size={30} /> : <ShieldCheck size={30} />}</div><div><p className="eyebrow">Auto-escalated readiness</p><h2>{report.status === "escalated" ? "Escalated" : "Ready"}</h2><p>{report.status === "escalated" ? `${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"} affect this route. Offline map and shelter are prepared.` : "No active warnings near this route. Offline map is available on request."}</p>{report.source && <span className="badge alert">Sources: {report.source}</span>}<small>Checked {new Date(report.checkedAt).toLocaleTimeString()}</small></div></article><div className="readiness-warnings">{report.warnings.length === 0 && <p className="readiness-none">No BWDB flood or BMD weather warnings intersect your route right now.</p>}{report.warnings.map((warning, index) => <article key={`${warning.provider}-${index}`} className={`warning-card ${warning.status === "Warning" ? "alert" : "caution"}`}><div className="warning-heading"><span className={`badge ${warning.status === "Warning" ? "alert" : "caution"}`}>{warning.provider === "bmd" ? "BMD weather" : "BWDB flood"}</span><strong>{warning.event} · {warning.severity}</strong></div><p>{warning.headline}</p><footer><span>{warning.area}</span><span>{warning.provider === "bmd" ? "Route passes through warned area" : `${warning.distanceKm} km from route`}</span>{warning.expires && <span>Expires {new Date(warning.expires).toLocaleString()}</span>}</footer></article>)}</div>{zones.length > 0 && <div className="readiness-zones"><h3>Low-network zones on this route</h3>{zones.map((zonePack) => { const progressState = zoneProgress[zonePack.zone.id]; const ready = zoneReady[zonePack.zone.id] || zonePack.offlineMap.status === "downloaded"; return <article key={zonePack.zone.id} className="readiness-offline readiness-zone-pack"><CloudOff size={22} /><h3>{zonePack.zone.name} · {zonePack.zone.region}</h3><p>{zonePack.zone.description}</p><p>{zonePack.offlineMap.tileCount} map tiles · {zonePack.emergencyBundle.personalContacts.length} personal contact(s) · {zonePack.emergencyBundle.nearbyServices.services.length} nearby service(s).</p>{ready ? <p className="offline-ready">Zone pack downloaded and cached. Emergency contacts and map stay available offline.</p> : <button onClick={() => void downloadZonePack(zonePack)} disabled={Boolean(progressState)}><Download size={16} /> Pre-download zone pack</button>}{progressState && <div className="offline-progress" role="progressbar" aria-valuenow={progressState.loaded} aria-valuemax={progressState.total}><span style={{ width: `${Math.round(progressState.loaded / Math.max(1, progressState.total) * 100)}%` }} /></div>}{progressState && <small>{progressState.loaded} / {progressState.total} tiles cached</small>}</article>; })}</div>}<div className="readiness-side"><article className="readiness-shelter"><MapPin size={22} /><h3>Nearest shelter</h3>{report.nearestShelter ? <><strong>{report.nearestShelter.name}</strong><span>{report.nearestShelter.distanceKm.toFixed(1)} km from route · {report.nearestShelter.source === "fallback" ? "curated fallback" : "live OpenStreetMap"}</span><a href={`https://www.openstreetmap.org/?mlat=${report.nearestShelter.point[1]}&mlon=${report.nearestShelter.point[0]}#map=15/${report.nearestShelter.point[1]}/${report.nearestShelter.point[0]}`} target="_blank" rel="noreferrer">Open in map <ArrowRight size={14} /></a></> : <p>No shelter found near this route.</p>}</article><article className="readiness-offline"><CloudOff size={22} /><h3>Offline map</h3><p>{report.offlineMap.tileCount} map tiles pre-selected for this route at zoom {report.offlineMap.zoom}.</p>{offlineReady || report.offlineMap.status === "downloaded" ? <p className="offline-ready">Offline map is downloaded and cached. It stays available even without a connection.</p> : <button onClick={() => void downloadOffline()} disabled={Boolean(progress) || report.offlineMap.tileCount === 0}><Download size={16} /> Pre-download offline map</button>}{progress && <div className="offline-progress" role="progressbar" aria-valuenow={progress.loaded} aria-valuemax={progress.total}><span style={{ width: `${Math.round(progress.loaded / Math.max(1, progress.total) * 100)}%` }} /></div>}{progress && <small>{progress.loaded} / {progress.total} tiles cached</small>}</article><div className="readiness-map-card"><ReadinessMap route={selectedTrip.route?.geometry} polygons={warningPolygons} shelter={report.nearestShelter} /></div></div></>}</div>}</section>}</main></PremiumGate></RequireAuth>;
}
