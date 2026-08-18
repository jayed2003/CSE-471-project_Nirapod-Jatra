"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, MapPin, Share2, Timer } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { EmergencyServicesPanel, type SelectedEmergencyService } from "@/components/EmergencyServicesPanel";
import { SosScriptPanel } from "@/components/sos-script-panel";
import { VoiceSosArm } from "@/components/voice-sos-arm";
import type { ScriptContact } from "@/components/sos-script-view";
import type { SafeWordSetting } from "@/lib/safe-word";

const MapPreview = dynamic(() => import("@/components/map-preview").then((module) => module.MapPreview), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const CHECK_IN_SECONDS = 6 * 60 * 60;
const SHARE_LOCATION_UPDATE_MIN_INTERVAL_MS = 10_000;

type Fix = { type: "Point"; coordinates: [number, number]; accuracyM?: number };

function currentLocation(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ type: "Point", coordinates: [position.coords.longitude, position.coords.latitude], accuracyM: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

type Profile = { user: { displayName: string; safeWord?: SafeWordSetting }; contacts: ScriptContact[]; trips: Array<{ _id: string; travelDates?: { end?: string } }> };

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
  const [selectedService, setSelectedService] = useState<SelectedEmergencyService | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const mapCardRef = useRef<HTMLElement | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState<Date | null>(null);
  const [shareStatus, setShareStatus] = useState("Not sharing your live location.");
  const shareTokenRef = useRef<string | null>(null);
  const shareWatchId = useRef<number | null>(null);
  const lastShareUpdateAt = useRef(0);
  const activeTrip = profile?.trips.find((trip) => trip.travelDates?.end && new Date(trip.travelDates.end) >= new Date());
  const activeTripId = activeTrip?._id ?? profile?.trips[0]?._id;

  async function refreshLocation() {
    setLocating(true);
    const location = await currentLocation();
    setCoords(location ? location.coordinates : null);
    setAccuracyM(location?.accuracyM);
    setLocating(false);
  }

  function selectService(service: SelectedEmergencyService, id: string) {
    setSelectedService(service);
    setSelectedServiceId(id);
    mapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearSelectedService() {
    setSelectedService(null);
    setSelectedServiceId(null);
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
        const result = await apiFetch<{ contactsNotified: number; emailsSent: number; testMode?: boolean }>("/api/sos", {
          method: "POST",
          body: JSON.stringify({ message: "Missed check-in: the 6-hour check-in timer expired without confirmation.", trigger: "missed-checkin", ...(location ? { location: { type: "Point", coordinates: location.coordinates }, accuracyM: location.accuracyM } : {}) }),
        });
        const testNote = result.testMode ? " (test mode — SMTP isn't configured yet, so nothing reached a real inbox)" : "";
        setCheckinStatus(`Check-in window expired. Emailed ${result.emailsSent} of ${result.contactsNotified} emergency contact(s).${testNote}`);
      } catch {
        setCheckinStatus("Check-in window expired, but we couldn't reach the server to notify contacts.");
      }
    })();
  }, [seconds]);

  async function sos() {
    setStatus("Sending SOS...");
    const location = await currentLocation();
    try {
      const result = await apiFetch<{ contactsNotified: number; emailsSent: number; testMode?: boolean }>("/api/sos", {
        method: "POST",
        body: JSON.stringify({ message: "Emergency SOS requested", trigger: "button", ...(location ? { location: { type: "Point", coordinates: location.coordinates }, accuracyM: location.accuracyM } : {}) }),
      });
      const testNote = result.testMode ? " (test mode — SMTP isn't configured yet, so nothing reached a real inbox)" : "";
      setStatus(result.contactsNotified === 0 ? "SOS recorded. Add an emergency contact so someone gets notified next time." : `SOS recorded. Emailed ${result.emailsSent} of ${result.contactsNotified} emergency contact(s).${testNote}`);
    } catch {
      setStatus("SOS queued for background sync when connected.");
    }
  }

  useEffect(() => () => { if (shareWatchId.current !== null) navigator.geolocation?.clearWatch(shareWatchId.current); }, []);

  async function startSharing() {
    setShareStatus("Starting live location share...");
    const location = await currentLocation();
    if (!location) { setShareStatus("Location unavailable. Allow location access to share your live location."); return; }
    try {
      const result = await apiFetch<{ token: string; shareUrl: string; expiresAt: string; contactsNotified: number; emailsSent: number; testMode?: boolean }>("/api/location-share/start", {
        method: "POST",
        body: JSON.stringify({ location: { type: location.type, coordinates: location.coordinates }, accuracy: location.accuracyM, durationMinutes: CHECK_IN_SECONDS / 60 }),
      });
      shareTokenRef.current = result.token;
      lastShareUpdateAt.current = Date.now();
      setShareUrl(result.shareUrl);
      setShareExpiresAt(new Date(result.expiresAt));
      setSharing(true);
      const testNote = result.testMode ? " (test mode — SMTP isn't configured yet, so nothing reached a real inbox)" : "";
      setShareStatus(result.contactsNotified === 0 ? "Sharing started. Add an emergency contact so someone gets the link next time." : `Sharing started. Emailed the live link to ${result.emailsSent} of ${result.contactsNotified} emergency contact(s).${testNote}`);
      if (navigator.geolocation) {
        shareWatchId.current = navigator.geolocation.watchPosition(
          (position) => {
            const now = Date.now();
            const token = shareTokenRef.current;
            if (!token || now - lastShareUpdateAt.current < SHARE_LOCATION_UPDATE_MIN_INTERVAL_MS) return;
            lastShareUpdateAt.current = now;
            void apiFetch(`/api/location-share/${token}/location`, {
              method: "PUT",
              body: JSON.stringify({ location: { type: "Point", coordinates: [position.coords.longitude, position.coords.latitude] }, accuracy: position.coords.accuracy }),
            }).catch(() => undefined);
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 5_000 },
        );
      }
    } catch (reason) {
      setShareStatus(reason instanceof Error ? reason.message : "Could not start live location sharing.");
    }
  }

  async function stopSharing() {
    if (shareWatchId.current !== null) { navigator.geolocation.clearWatch(shareWatchId.current); shareWatchId.current = null; }
    shareTokenRef.current = null;
    setSharing(false);
    setShareUrl("");
    setShareExpiresAt(null);
    setShareStatus("Sharing stopped.");
    try { await apiFetch("/api/location-share/stop", { method: "POST" }); } catch { /* already stopped locally */ }
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
          <article>
            <Share2 size={28} />
            <h2>Share live location</h2>
            {sharing && <div className="monitoring"><span /> Live</div>}
            <p>{shareStatus}</p>
            {!sharing ? (
              <button onClick={() => void startSharing()}>Start sharing (6 hours)</button>
            ) : (
              <>
                <p className="services-status">Link: <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></p>
                {shareExpiresAt && <p className="services-status">Live until {shareExpiresAt.toLocaleString()}</p>}
                <button className="text-button" onClick={() => void stopSharing()}>Stop sharing</button>
              </>
            )}
          </article>
          <article className="emergency-map-card" ref={mapCardRef}>
            <MapPin size={28} />
            <h2>Nearby now</h2>
            <p>{selectedService ? <>Showing <strong>{selectedService.name}</strong> relative to your current location.</> : "Your current location, shown for reference only. Nothing here is shared unless you send an SOS."}</p>
            {locating && <div className="map-loading">Finding your location...</div>}
            {!locating && coords && (
              <MapPreview
                center={selectedService ? selectedService.point : coords}
                label={selectedService ? selectedService.name : "You are here"}
                zoom={15}
                secondaryMarker={selectedService ? { point: coords, label: "You are here" } : undefined}
              />
            )}
            {!locating && coords && accuracyM !== undefined && (
              <p className="services-status">
                Reported accuracy: ~{accuracyM >= 1000 ? `${(accuracyM / 1000).toFixed(1)} km` : `${Math.round(accuracyM)} m`}
                {accuracyM > 300 && " — this is a Wi-Fi/IP position estimate, not GPS, so it can land a neighborhood off (even when the browser reports a small accuracy number, the underlying Wi-Fi location database can be stale for this area). Open this page on a phone with GPS enabled for a precise fix, or check Windows Settings → Privacy & security → Location is on for your browser."}
              </p>
            )}
            {!locating && !coords && <p>Location unavailable. Allow location access in your browser to see the map.</p>}
            <button className="text-button" onClick={() => void refreshLocation()}>Refresh location</button>
            {selectedService && <button className="text-button" onClick={clearSelectedService}>Show my location only</button>}
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
          {!locating && coords && <EmergencyServicesPanel center={coords} onSelect={selectService} selectedId={selectedServiceId} tripId={activeTripId} />}
        </section>
      </main>
    </RequireAuth>
  );
}
