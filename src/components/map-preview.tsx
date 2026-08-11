"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type MapPreviewProps = { center?: [number, number]; label?: string; zoom?: number };

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function MapPreview({ center = [90.4125, 23.8103], label = "Dhaka", zoom = 11 }: MapPreviewProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [message, setMessage] = useState("Loading map");

  useEffect(() => {
    if (!mapElement.current) return;
    const map = new maplibregl.Map({
      container: mapElement.current,
      style: mapStyle,
      center,
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    markerRef.current = new maplibregl.Marker({ color: "#d95c4a" }).setLngLat(center).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label)).addTo(map);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapElement.current);
    map.on("load", () => { map.resize(); markerRef.current?.togglePopup(); setMessage(`Map ready · ${label}`); });
    map.on("error", () => setMessage("Map tiles could not load. Saved map data remains available offline."));
    return () => { resizeObserver.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat(center).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label));
    mapRef.current.flyTo({ center, zoom, essential: true });
    setMessage(`Map ready · ${label}`);
  }, [center, label, zoom]);

  return <div className="map-wrap"><div className="map-canvas" ref={mapElement} aria-label={`Safety map centered on ${label}`} /><span className="map-status">{message}</span></div>;
}