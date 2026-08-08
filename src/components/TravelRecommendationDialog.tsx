"use client";

import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";

type TravelContext = { destination: string; distanceKm?: number; durationMin?: number; temperature?: number; weather?: string; aqi?: number; aqiLabel?: string };
type Props = { open: boolean; context: TravelContext | null; brief: string | null; loading: boolean; onClose: () => void };

export function TravelRecommendationDialog({ open, context, brief, loading, onClose }: Props) {
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose, open]);
  if (!open || !context) return null;
  const lines = brief?.split("\n").filter(Boolean) ?? [];
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="travel-dialog" role="dialog" aria-modal="true" aria-labelledby="travel-dialog-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span><Sparkles size={16} /> Travel brief</span><h2 id="travel-dialog-title">{context.destination.split(",")[0]}</h2></div><button onClick={onClose} aria-label="Close travel brief"><X size={20} /></button></header><div className="travel-context"><span>{context.distanceKm ? `${context.distanceKm} km` : "Route ready"}</span><span>{context.durationMin ? `${context.durationMin} min` : ""}</span><span>{context.weather ?? "Weather unavailable"}</span><span>{context.aqiLabel ? `Air: ${context.aqiLabel}` : ""}</span></div>{loading && <p className="dialog-loading">Preparing your destination brief...</p>}{!loading && lines.length > 0 && <ul>{lines.map((line, index) => <li key={index}>{line.replace(/^[-*]\s*/, "")}</li>)}</ul>}{!loading && !brief && <p className="dialog-loading">Travel recommendations are unavailable. Your deterministic route and safety data remain available.</p>}<footer>AI-generated travel context. Deterministic conditions and safety rules remain the source of risk information.</footer></section></div>;
}