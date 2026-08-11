"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type RouteGeometry = { type?: string; coordinates?: Array<[number, number]> } | null | undefined;
type Polygon = Array<[number, number]>;

type ReadinessMapProps = {
  route?: RouteGeometry;
  polygons?: Polygon[];
  shelter?: { point: [number, number]; name: string } | null;
};

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function ReadinessMap({ route, polygons, shelter }: ReadinessMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shelterMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!element.current) return;
    const map = new maplibregl.Map({ container: element.current, style: mapStyle, center: [90.4125, 23.8103], zoom: 8 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setReady(true));
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(element.current);
    return () => { observer.disconnect(); shelterMarker.current?.remove(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const layerIds = ["route-line", "warning-fill", "warning-outline"];
    const sourceIds = ["route-source", "warning-source"];
    layerIds.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    sourceIds.forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
    const bounds = new maplibregl.LngLatBounds();
    const routeCoordinates = route?.coordinates ?? [];
    if (routeCoordinates.length) {
      routeCoordinates.forEach(([lng, lat]) => bounds.extend([lng, lat]));
      map.addSource("route-source", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeCoordinates } } });
      map.addLayer({ id: "route-line", type: "line", source: "route-source", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.95 } });
    }
    const warningPolygons = (polygons ?? []).filter((polygon) => polygon.length >= 3);
    if (warningPolygons.length) {
      const features = warningPolygons.map((polygon) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [polygon] } }));
      features.forEach((feature) => feature.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lng, lat])));
      map.addSource("warning-source", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({ id: "warning-fill", type: "fill", source: "warning-source", paint: { "fill-color": "#cf4a4a", "fill-opacity": 0.25 } });
      map.addLayer({ id: "warning-outline", type: "line", source: "warning-source", paint: { "line-color": "#cf4a4a", "line-width": 2 } });
    }
    if (shelter) {
      shelterMarker.current?.remove();
      shelterMarker.current = new maplibregl.Marker({ color: "#16a34a" }).setLngLat(shelter.point).setPopup(new maplibregl.Popup({ offset: 18 }).setText(shelter.name)).addTo(map);
      bounds.extend(shelter.point);
    }
    if (bounds.getWest() !== bounds.getEast() && bounds.getSouth() !== bounds.getNorth()) map.fitBounds(bounds, { padding: 60, duration: 500 });
  }, [polygons, ready, route, shelter]);

  return <div className="readiness-map" ref={element} aria-label="Route readiness map with warned areas and nearest shelter" />;
}
