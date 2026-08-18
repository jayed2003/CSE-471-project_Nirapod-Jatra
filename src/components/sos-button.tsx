"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { apiFetch, getToken } from "@/lib/api-client";

export function SosButton() {
  const [message, setMessage] = useState("");
  async function sendSos() {
    if (!getToken()) { setMessage("Sign in to send an SOS"); return; }
    setMessage("Sending SOS...");
    try {
      const position = await new Promise<GeolocationPosition | null>((resolve) => navigator.geolocation?.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000 }));
      // apiFetch attaches the bearer token; /api/sos requires auth, and a bare fetch here used to
      // 401 and be reported to the user as a queued SOS that was never actually sent.
      const result = await apiFetch<{ queued?: boolean; contactsNotified?: number; emailsSent?: number; testMode?: boolean }>("/api/sos", {
        method: "POST",
        body: JSON.stringify({
          message: "Emergency SOS requested",
          trigger: "button",
          ...(position ? { location: { type: "Point", coordinates: [position.coords.longitude, position.coords.latitude] }, accuracyM: position.coords.accuracy } : {}),
        }),
      });
      // The service worker answers 202 with {queued:true} when it parks the request for background sync.
      const testNote = result?.testMode ? " (test mode — real email delivery is not configured yet)" : "";
      setMessage(result?.queued ? "SOS queued for sync" : `SOS sent${typeof result?.emailsSent === "number" ? ` to ${result.emailsSent} contact(s)` : ""}${testNote}`);
    } catch (failure) {
      setMessage(failure instanceof Error && /Authentication/i.test(failure.message) ? "Sign in to send an SOS" : "SOS queued when connection returns");
    }
  }

  return <div className="sos-control"><button className="sos-button" onClick={() => void sendSos()} aria-label="Send emergency SOS" title="Send emergency SOS"><AlertTriangle size={18} /> SOS</button>{message && <span role="status">{message}</span>}</div>;
}
