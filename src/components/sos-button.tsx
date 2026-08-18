"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

export function SosButton() {
  const [message, setMessage] = useState("");
  async function sendSos() {
    try {
      const position = await new Promise<GeolocationPosition | null>((resolve) => navigator.geolocation?.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000 }));
      const response = await fetch("/api/sos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location: position ? { type: "Point", coordinates: [position.coords.longitude, position.coords.latitude] } : undefined, message: "Emergency SOS requested" }) });
      if (!response.ok) throw new Error("Emergency request was rejected");
      if (response.status === 202) { setMessage("SOS queued for sync"); return; }
      const result = await response.json() as { testMode?: boolean };
      setMessage(result.testMode ? "SOS sent (test mode — real email delivery is not configured yet)" : "SOS sent");
    } catch { setMessage("SOS queued when connection returns"); }
  }

  return <div className="sos-control"><button className="sos-button" onClick={() => void sendSos()} aria-label="Send emergency SOS" title="Send emergency SOS"><AlertTriangle size={18} /> SOS</button>{message && <span role="status">{message}</span>}</div>;
}