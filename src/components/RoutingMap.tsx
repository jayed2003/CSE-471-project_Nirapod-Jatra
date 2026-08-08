"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Crosshair, MapPin, Navigation, RotateCcw, Search } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { searchPlace } from "@/services/geocode";
import { getRoute, type Point, type RouteInfo } from "@/services/routing";

const DHAKA: Point = { lng: 90.4125, lat: 23.8103, label: "Dhaka" };
const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function RoutingMap() {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startMarker = useRef<maplibregl.Marker | null>(null);
  const endMarker = useRef<maplibregl.Marker | null>(null);
  const poiMarkers = useRef<maplibregl.Marker[]>([]);
  const startRef = useRef<Point | null>(null);
  const endRef = useRef<Point | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [alternatives, setAlternatives] = useState<RouteInfo[]>([]);
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [message, setMessage] = useState("Choose a start point, then a destination.");
  const [loading, setLoading] = useState(false);
  const [safetyLayers, setSafetyLayers] = useState(false);

  const drawMarker = useCallback((point: Point, kind: "start" | "end") => {
    const reference = kind === "start" ? startMarker : endMarker;
    reference.current?.remove();
    reference.current = new maplibregl.Marker({ color: kind === "start" ? "#16a34a" : "#dc2626" }).setLngLat([point.lng, point.lat]).setPopup(new maplibregl.Popup({ offset: 20 }).setText(point.label ?? (kind === "start" ? "Start" : "Destination"))).addTo(mapRef.current!);
  }, []);

  const placePoint = useCallback((point: Point) => {
    if (!startRef.current) { startRef.current = point; setStart(point); drawMarker(point, "start"); setMessage("Start set. Choose a destination."); return; }
    if (!endRef.current) { endRef.current = point; setEnd(point); drawMarker(point, "end"); setMessage("Destination set. Calculating route..."); return; }
    startMarker.current?.remove(); endMarker.current?.remove();
    if (mapRef.current?.getLayer("route-line")) mapRef.current.removeLayer("route-line");
    if (mapRef.current?.getSource("route")) mapRef.current.removeSource("route");
    setRouteInfo(null); endRef.current = null; startRef.current = point; setEnd(null); setStart(point); drawMarker(point, "start"); setMessage("Route reset. Choose a destination.");
  }, [drawMarker]);

  useEffect(() => {
    if (!mapElement.current) return;
    const map = new maplibregl.Map({ container: mapElement.current, style: mapStyle, center: [DHAKA.lng, DHAKA.lat], zoom: 12.5 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (event) => placePoint({ lng: event.lngLat.lng, lat: event.lngLat.lat }));
    const observer = new ResizeObserver(() => map.resize()); observer.observe(mapElement.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, [placePoint]);

  useEffect(() => {
    if (!start || !end || !mapRef.current) return;
    const routeStart = start;
    const routeEnd = end;
    let cancelled = false;
    async function loadRoute() {
      setLoading(true);
      try {
        const environment = await fetch(`/api/environment?lat=${routeEnd.lat}&lon=${routeEnd.lng}`).then((response) => response.ok ? response.json() : null).catch(() => null);
        const routes = await getRoute(routeStart, routeEnd, { aqi: environment?.air?.current?.aqi, weatherAlert: Boolean(environment?.weather?.current?.weatherCode >= 95) });
        const nextRoute = routes.find((route) => route.recommended) ?? routes[0];
        if (cancelled || !mapRef.current) return;
        const map = mapRef.current;
        alternatives.forEach((_, index) => { const id = `route-line-${index}`; const source = `route-${index}`; if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(source)) map.removeSource(source); });
        routes.forEach((route, index) => { const id = `route-line-${index}`; const source = `route-${index}`; map.addSource(source, { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } }); map.addLayer({ id, type: "line", source, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": route.recommended ? "#2563eb" : "#94a3b8", "line-width": route.recommended ? 6 : 3, "line-opacity": route.recommended ? 0.95 : 0.65 } }); });
        const bounds = new maplibregl.LngLatBounds([routeStart.lng, routeStart.lat], [routeEnd.lng, routeEnd.lat]); map.fitBounds(bounds, { padding: 80, duration: 700 });
        setAlternatives(routes); setRouteInfo(nextRoute); setMessage(nextRoute.isFallback ? "Street routing is temporarily unavailable. Showing a direct route." : `${routes.length} routes scored with current weather and air quality.`);
      } catch { if (!cancelled) setMessage("Routing failed. Please try another route."); } finally { if (!cancelled) setLoading(false); }
    }
    void loadRoute(); return () => { cancelled = true; };
  }, [alternatives, end, start]);

  function chooseRoute(route: RouteInfo) { setRouteInfo(route); const map = mapRef.current; if (!map) return; alternatives.forEach((alternative, index) => { map.setPaintProperty(`route-line-${index}`, "line-width", alternative === route ? 6 : 3); map.setPaintProperty(`route-line-${index}`, "line-color", alternative === route ? "#2563eb" : "#94a3b8"); }); }

  async function search(query: string, kind: "start" | "end") {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const place = await searchPlace(query);
      const point = { lng: place.lon, lat: place.lat, label: place.displayName };
      if (kind === "start") { startRef.current = point; setStart(point); drawMarker(point, "start"); mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 }); } else { endRef.current = point; setEnd(point); drawMarker(point, "end"); mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 }); }
      setMessage(kind === "start" ? "Start set. Add a destination." : "Destination set. Calculating route...");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please check your internet connection."); } finally { setLoading(false); }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setMessage("Location is not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition((position) => { const point = { lng: position.coords.longitude, lat: position.coords.latitude, label: "Your location" }; startRef.current = point; setStart(point); drawMarker(point, "start"); mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 }); setMessage("Your location is set as the start."); }, () => setMessage("Location permission was denied. Choose a point on the map instead."), { enableHighAccuracy: true, timeout: 10_000 });
  }

  function clearRoute() {
    startMarker.current?.remove(); endMarker.current?.remove(); startMarker.current = null; endMarker.current = null;
    const map = mapRef.current; alternatives.forEach((_, index) => { if (map?.getLayer(`route-line-${index}`)) map.removeLayer(`route-line-${index}`); if (map?.getSource(`route-${index}`)) map.removeSource(`route-${index}`); });
    startRef.current = null; endRef.current = null; setStart(null); setEnd(null); setAlternatives([]); setRouteInfo(null); setStartQuery(""); setEndQuery(""); setMessage("Route cleared. Choose a start point."); map?.flyTo({ center: [DHAKA.lng, DHAKA.lat], zoom: 12.5 });
  }

  async function toggleSafetyLayers() {
    if (safetyLayers) { poiMarkers.current.forEach((marker) => marker.remove()); poiMarkers.current = []; setSafetyLayers(false); return; }
    const location = end ?? start ?? DHAKA;
    try { const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/pois/nearby?lng=${location.lng}&lat=${location.lat}`); if (!response.ok) throw new Error(); const data = await response.json() as { elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { amenity?: string; office?: string; name?: string } }> }; const colors: Record<string, string> = { hospital: "#dc2626", shelter: "#2563eb", police: "#7c3aed", pharmacy: "#16a34a", embassy: "#e2a63b" }; poiMarkers.current = data.elements.flatMap((point) => { const latitude = point.lat ?? point.center?.lat; const longitude = point.lon ?? point.center?.lon; const kind = point.tags?.amenity ?? point.tags?.office ?? ""; if (latitude === undefined || longitude === undefined || !colors[kind] || !mapRef.current) return []; return [new maplibregl.Marker({ color: colors[kind], scale: .75 }).setLngLat([longitude, latitude]).setPopup(new maplibregl.Popup({ offset: 16 }).setText(`${point.tags?.name ?? kind} · ${kind}`)).addTo(mapRef.current)]; }); setSafetyLayers(true); setMessage(`${poiMarkers.current.length} nearby safety places shown.`); } catch { setMessage("Safety places are unavailable. Please check your connection."); }
  }

  return <section className="routing-module" aria-label="Route planning map"><div className="routing-heading"><div><p className="eyebrow">Live navigation</p><h2>Plan a safer route</h2></div><p>{message}</p></div><div className="routing-controls"><label>Start location<div><MapPin size={16} /><input value={startQuery} onChange={(event) => setStartQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search(startQuery, "start")} placeholder="Search start location" /><button onClick={() => void search(startQuery, "start")} aria-label="Search start location"><Search size={16} /></button></div></label><label>Destination<div><Navigation size={16} /><input value={endQuery} onChange={(event) => setEndQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search(endQuery, "end")} placeholder="Search destination" /><button onClick={() => void search(endQuery, "end")} aria-label="Search destination"><Search size={16} /></button></div></label><div className="routing-actions"><button onClick={useMyLocation}><Crosshair size={16} /> Use my location</button><button onClick={clearRoute}><RotateCcw size={16} /> Clear route</button><button onClick={() => void toggleSafetyLayers()}>{safetyLayers ? "Hide safety places" : "Show safety places"}</button></div></div><div className="routing-map-wrap"><div className="routing-map" ref={mapElement} aria-label="Interactive OpenStreetMap route planner" />{loading && <div className="routing-loading" role="status">Updating route...</div>}{routeInfo && <aside className="route-info" aria-label="Route distance and travel time"><strong>{routeInfo.distanceKm} km</strong><span>{routeInfo.durationMin} min</span>{routeInfo.isFallback && <small>Direct estimate</small>}</aside>}</div>{alternatives.length > 1 && <div className="route-alternatives" aria-label="Route alternatives">{alternatives.map((route, index) => <button key={index} className={route === routeInfo ? "selected" : ""} onClick={() => chooseRoute(route)}><strong>{route.recommended ? "Recommended" : `Option ${index + 1}`}</strong><span>{route.distanceKm} km · {route.durationMin} min · score {route.score}</span></button>)}</div>}{routeInfo && !routeInfo.isFallback && routeInfo.instructions.length > 0 && <ol className="route-steps" aria-label="Route steps">{routeInfo.instructions.slice(0, 4).map((step, index) => <li key={`${step.name}-${index}`}><span>{step.instruction}</span>{step.name}</li>)}</ol>}</section>;
}