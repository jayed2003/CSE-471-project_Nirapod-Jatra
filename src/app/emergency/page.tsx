"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, MapPin, Timer } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { EmergencyServicesPanel } from "@/components/EmergencyServicesPanel";
import { SosScriptPanel } from "@/components/sos-script-panel";
import { VoiceSosArm } from "@/components/voice-sos-arm";
import type { ScriptContact } from "@/components/sos-script-view";
import type { SafeWordSetting } from "@/lib/safe-word";

const MapPreview = dynamic(() => import("@/components/map-preview").then((module) => module.MapPreview), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const CHECK_IN_SECONDS = 6 * 60 * 60;

type Fix = { type: "Point"; coordinates: [number, number]; accuracyM?: number };

function currentLocation(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ type: "Point", coordinates: [position.coords.longitude, position.coords.latitude], accuracyM: position.coords.accuracy }),
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}

type Profile = { user: { displayName: string; safeWord?: SafeWordSetting }; contacts: ScriptContact[] };

function formatCountdown(seconds: number) {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function EmergencyPage() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [status, setStatus] = useState("Ready");
  const [checkinStatus, setCheckinStatus] = useState("");
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | undefined>(undefined);
  const [locating, setLocating] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const checkinAlertSent = useRef(false);

  async function refreshLocation() {
    setLocating(true);
    const location = await currentLocation();
    setCoords(location ? location.coordinates : null);
    setAccuracyM(location?.accuracyM);
    setLocating(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshLocation(); });
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Profile>("/api/me")
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (seconds === null || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value && value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    if (seconds !== 0 || checkinAlertSent.current) return;
    checkinAlertSent.current = true;
    setCheckinStatus("Check-in window expired. Notifying your emergency contacts...");
    (async () => {
      const location = await currentLocation();
      try {
        const result = await apiFetch<{ contactsNotified: number; emailsSent: number }>("/api/sos", {
          method: "POST",
          body: JSON.stringify({ message: "Missed check-in: the 6-hour check-in timer expired without confirmation.", trigger: "missed-checkin", ...(location ? { location: { type: "Point", coordinates: location.coordinates }, accuracyM: location.accuracyM } : {}) }),
        });
        setCheckinStatus(`Check-in window expired. Emailed ${result.emailsSent} of ${result.contactsNotified} emergency contact(s).`);
      } catch {
        setCheckinStatus("Check-in window expired, but we couldn't reach the server to notify contacts.");
      }
    })();
  }, [seconds]);

  async function sos() {
    setStatus("Sending SOS...");
    const location = await currentLocation();
    try {
      const result = await apiFetch<{ contactsNotified: number; emailsSent: number }>("/api/sos", {
        method: "POST",
        body: JSON.stringify({ message: "Emergency SOS requested", trigger: "button", ...(location ? { location: { type: "Point", coordinates: location.coordinates }, accuracyM: location.accuracyM } : {}) }),
      });
      setStatus(result.contactsNotified === 0 ? "SOS recorded. Add an emergency contact so someone gets notified next time." : `SOS recorded. Emailed ${result.emailsSent} of ${result.contactsNotified} emergency contact(s).`);
    } catch {
      setStatus("SOS queued for background sync when connected.");
    }
  }

  function startCheckin() {
    checkinAlertSent.current = false;
    setCheckinStatus("");
    setSeconds(CHECK_IN_SECONDS);
  }

  function cancelCheckin() {
    checkinAlertSent.current = true;
    setCheckinStatus("");
    setSeconds(null);
  }

  return (
    <RequireAuth>
      <main className="subpage emergency-page">
        <header className="subpage-header">
          <p className="eyebrow">Emergency response</p>
          <h1>Stay connected</h1>
          <p>Use SOS for immediate escalation or set a check-in timer for automatic follow-up.</p>
        </header>
        <section className="emergency-grid">
          <article>
            <AlertTriangle size={28} />
            <h2>Send SOS</h2>
            <p>{status}</p>
            <button className="danger-button" onClick={() => void sos()}>Send emergency SOS</button>
          </article>
          <article>
            <Timer size={28} />
            <h2>Check on me</h2>
            <div className="countdown">{seconds === null ? "Not scheduled" : formatCountdown(seconds)}</div>
            <button onClick={startCheckin}>Start 6-hour check-in</button>
            {seconds !== null && <button className="text-button" onClick={cancelCheckin}>Cancel countdown</button>}
            {checkinStatus && <p>{checkinStatus}</p>}
          </article>
          <article className="emergency-map-card">
            <MapPin size={28} />
            <h2>Nearby now</h2>
            <p>Your current location, shown for reference only. Nothing here is shared unless you send an SOS.</p>
            {locating && <div className="map-loading">Finding your location...</div>}
            {!locating && coords && <MapPreview center={coords} label="You are here" zoom={15} />}
            {!locating && !coords && <p>Location unavailable. Allow location access in your browser to see the map.</p>}
            <button className="text-button" onClick={() => void refreshLocation()}>Refresh location</button>
          </article>
          {!locating && coords && (
            <SosScriptPanel center={coords} accuracyM={accuracyM} contacts={profile?.contacts ?? []} callerName={profile?.user.displayName ?? "A Nirapod Jatra user"} />
          )}
          {!locating && !coords && (
            <article className="sos-script-card">
              <AlertTriangle size={28} />
              <h2>SOS script</h2>
              <p>Allow location access to auto-build a script with your exact coordinates and nearest landmark.</p>
              <button className="text-button" onClick={() => void refreshLocation()}>Try location again</button>
            </article>
          )}
          <VoiceSosArm
            center={coords}
            accuracyM={accuracyM}
            contacts={profile?.contacts ?? []}
            callerName={profile?.user.displayName ?? "A Nirapod Jatra user"}
            initialSafeWord={profile?.user.safeWord ?? null}
          />
          {!locating && coords && <EmergencyServicesPanel center={coords} />}
        </section>
      </main>
    </RequireAuth>
  );
}
