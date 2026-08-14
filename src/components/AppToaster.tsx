"use client";

import { AlertTriangle, Wind, X } from "lucide-react";
import { useEffect, useState } from "react";

type AqiAlert = { destination: string; aqi: number };

export function AppToaster() {
  const [alert, setAlert] = useState<AqiAlert | null>(null);

  useEffect(() => {
    const showAlert = (event: Event) => setAlert((event as CustomEvent<AqiAlert>).detail);
    window.addEventListener("app:aqi-alert", showAlert);
    return () => window.removeEventListener("app:aqi-alert", showAlert);
  }, []);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  if (!alert) return null;

  return <aside className="app-toaster" role="alert" aria-live="assertive">
    <div className="app-toaster-icon"><AlertTriangle size={20} /></div>
    <div className="app-toaster-copy">
      <span><Wind size={14} /> AQI {alert.aqi} at {alert.destination.split(",")[0]}</span>
      <strong>Air quality warning</strong>
      <p>The air quality is very bad at your destination. Consider limiting your outdoor activities.</p>
    </div>
    <button type="button" onClick={() => setAlert(null)} aria-label="Dismiss air quality warning"><X size={18} /></button>
  </aside>;
}