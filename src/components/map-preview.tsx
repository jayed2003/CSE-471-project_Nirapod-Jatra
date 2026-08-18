"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type MapMarker = { point: [number, number]; label: string };
type MapPreviewProps = { center?: [number, number]; label?: string; zoom?: number; secondaryMarker?: MapMarker };

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function MapPreview({ center = [90.4125, 23.8103], label = "Dhaka", zoom = 11, secondaryMarker }: MapPreviewProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const secondaryMarkerRef = useRef<maplibregl.Marker | null>(null);
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
    return () => { resizeObserver.disconnect(); map.remove(); mapRef.current = null; secondaryMarkerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat(center).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label));
    if (secondaryMarker) {
      if (!secondaryMarkerRef.current) secondaryMarkerRef.current = new maplibregl.Marker({ color: "#3fa88c" }).setLngLat(secondaryMarker.point).addTo(mapRef.current);
      secondaryMarkerRef.current.setLngLat(secondaryMarker.point).setPopup(new maplibregl.Popup({ offset: 24 }).setText(secondaryMarker.label));
      const bounds = new maplibregl.LngLatBounds(center, center).extend(secondaryMarker.point);
      mapRef.current.fitBounds(bounds, { padding: 56, maxZoom: zoom, essential: true });
    } else {
      secondaryMarkerRef.current?.remove();
      secondaryMarkerRef.current = null;
      mapRef.current.flyTo({ center, zoom, essential: true });
    }
    setMessage(`Map ready · ${label}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], label, zoom, secondaryMarker?.point[0], secondaryMarker?.point[1], secondaryMarker?.label]);

  return <div className="map-wrap"><div className="map-canvas" ref={mapElement} aria-label={`Safety map centered on ${label}`} /><span className="map-status">{message}</span></div>;
}
