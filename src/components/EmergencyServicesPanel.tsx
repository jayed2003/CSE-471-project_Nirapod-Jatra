"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Ambulance, Flame, Hospital, MapPinned, Phone, RefreshCw, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { readAnyZonePack, type CachedZonePack } from "@/lib/lowNetworkZones";

type EmergencyServiceCategory = "hospital" | "fire" | "ambulance" | "police";
type NearbyEmergencyService = {
  id: string;
  name: string;
  category: EmergencyServiceCategory;
  point: [number, number];
  distanceMeters: number;
  phones: string[];
};
export type SelectedEmergencyService = { name: string; point: [number, number] };

const CATEGORY_ICON: Record<EmergencyServiceCategory, typeof Hospital> = {
  hospital: Hospital,
  fire: Flame,
  ambulance: Ambulance,
  police: ShieldAlert,
};

const SECTIONS: Array<{ label: string; categories: EmergencyServiceCategory[] }> = [
  { label: "Hospitals", categories: ["hospital"] },
  { label: "Fire services", categories: ["fire"] },
  { label: "Ambulance services", categories: ["ambulance"] },
  { label: "Other emergency services", categories: ["police"] },
];

const SEARCH_RADIUS_METERS = 400;

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km away` : `${meters} m away`;
}

export function EmergencyServicesPanel({
  center,
  onSelect,
  selectedId,
  tripId,
}: {
  center: [number, number];
  onSelect?: (service: SelectedEmergencyService, id: string) => void;
  selectedId?: string | null;
  tripId?: string;
}) {
  const [services, setServices] = useState<NearbyEmergencyService[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [degraded, setDegraded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [callTarget, setCallTarget] = useState<{ label: string; number: string } | null>(null);
  const [offlinePack, setOfflinePack] = useState<CachedZonePack | null>(null);

  function requestCall(event: MouseEvent<HTMLAnchorElement>, label: string, number: string) {
    event.preventDefault();
    setCallTarget({ label, number });
  }

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setOfflinePack(null);
    apiFetch<{ services: NearbyEmergencyService[]; degraded: boolean }>(
      `/api/emergency-services/nearby?lat=${center[1]}&lng=${center[0]}&radius=${SEARCH_RADIUS_METERS}`,
    )
      .then((result) => {
        if (!cancelled) {
          setServices(result.services);
          setDegraded(result.degraded);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setServices([]);
        setDegraded(false);
        setStatus("error");
        if (tripId)
          void readAnyZonePack(tripId).then((pack) => {
            if (!cancelled && pack) setOfflinePack(pack);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [center, retryCount, tripId]);

  return (
    <article className="emergency-services-card">
      <ShieldAlert size={28} />
      <h2>Emergency services nearby</h2>
      <p>
        Hospitals, fire, ambulance and other emergency services within {SEARCH_RADIUS_METERS} m of
        your current location.
      </p>
      <a
        className="hotline-card"
        href="tel:999"
        onClick={(event) => requestCall(event, "National Emergency Hotline", "999")}
      >
        <Phone size={18} />
        <span>
          <strong>National Emergency Hotline</strong>
          <small>Police · Fire · Ambulance</small>
        </span>
        <strong>999</strong>
      </a>
      {status === "loading" && <p className="services-status">Finding nearby services...</p>}
      {status === "error" && !offlinePack && (
        <p className="services-status">
          Couldn&apos;t reach the emergency services lookup. Try refreshing your location.
        </p>
      )}
      {status === "error" && offlinePack && (
        <div className="offline-zone-pack">
          <p className="services-status services-degraded">
            Offline pack: {offlinePack.zoneName} · cached{" "}
            {new Date(offlinePack.cachedAt).toLocaleString()} — may be outdated.
          </p>
          {offlinePack.personalContacts.length > 0 && (
            <section className="services-group">
              <h3>Your emergency contacts</h3>
              <ul>
                {offlinePack.personalContacts.map((contact) => (
                  <li key={contact.email}>
                    <div className="service-name">
                      <strong>{contact.name}</strong>
                    </div>
                    <div className="service-phones">
                      <a
                        href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                        onClick={(event) => requestCall(event, contact.name, contact.phone)}
                      >
                        <Phone size={12} /> {contact.phone}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {offlinePack.nearbyServices.length > 0 && (
            <section className="services-group">
              <h3>Cached nearby services</h3>
              <ul>
                {offlinePack.nearbyServices.map((service) => (
                  <li key={service.id}>
                    <div className="service-name">
                      <strong>{service.name}</strong>
                      <span>{formatDistance(service.distanceMeters)}</span>
                    </div>
                    <div className="service-phones">
                      {service.phones.length === 0 && (
                        <span className="no-number">No number listed</span>
                      )}
                      {service.phones.map((phone) => (
                        <a
                          key={phone}
                          href={`tel:${phone.replace(/\s+/g, "")}`}
                          onClick={(event) => requestCall(event, service.name, phone)}
                        >
                          <Phone size={12} /> {phone}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {status === "ready" && degraded && (
        <p className="services-status services-degraded">
          Live lookup was slow and results may be incomplete — this is not a confirmed &quot;none
          nearby&quot;.
          <button
            type="button"
            className="text-button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </p>
      )}
      {status === "ready" && (
        <div className="services-groups">
          {SECTIONS.map((section) => {
            const items = services
              .filter((service) => section.categories.includes(service.category))
              .sort((a, b) => a.distanceMeters - b.distanceMeters);
            return (
              <section key={section.label} className="services-group">
                <h3>{section.label}</h3>
                {items.length === 0 && (
                  <p className="services-empty">None found within {SEARCH_RADIUS_METERS} m.</p>
                )}
                {items.length > 0 && (
                  <ul>
                    {items.map((service) => {
                      const Icon = CATEGORY_ICON[service.category];
                      return (
                        <li key={service.id}>
                          <div className="service-name">
                            <Icon size={15} />
                            <strong>{service.name}</strong>
                            <span>{formatDistance(service.distanceMeters)}</span>
                            <button
                              type="button"
                              className={`service-locate${selectedId === service.id ? " selected" : ""}`}
                              onClick={() =>
                                onSelect?.({ name: service.name, point: service.point }, service.id)
                              }
                              aria-label={`Show ${service.name} on the map`}
                              title={`Show ${service.name} on the map`}
                            >
                              <MapPinned size={13} />
                            </button>
                          </div>
                          <div className="service-phones">
                            {service.phones.length === 0 && (
                              <span className="no-number">No number listed</span>
                            )}
                            {service.phones.map((phone) => (
                              <a
                                key={phone}
                                href={`tel:${phone.replace(/\s+/g, "")}`}
                                onClick={(event) => requestCall(event, service.name, phone)}
                              >
                                <Phone size={12} /> {phone}
                              </a>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {callTarget && (
        <div className="confirm-overlay" onClick={() => setCallTarget(null)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="call-dialog-title">Call {callTarget.label}?</h3>
            <p>
              You&apos;re about to dial <strong>{callTarget.number}</strong>.
            </p>
            <div className="confirm-actions">
              <button className="confirm-no" onClick={() => setCallTarget(null)}>
                Cancel
              </button>
              <button
                className="confirm-go"
                onClick={() => {
                  window.location.href = `tel:${callTarget.number.replace(/\s+/g, "")}`;
                  setCallTarget(null);
                }}
              >
                <Phone size={14} /> Call
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
