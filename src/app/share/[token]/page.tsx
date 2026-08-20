"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

const MapPreview = dynamic(
  () => import("@/components/map-preview").then((module) => module.MapPreview),
  {
    ssr: false,
    loading: () => <div className="map-loading">Loading map...</div>,
  },
);

type SharePayload = {
  active: boolean;
  requesterName: string;
  location?: { type: "Point"; coordinates: [number, number] };
  accuracy?: number;
  lastUpdatedAt?: string;
  expiresAt: string;
};

const POLL_MS = 6_000;

function formatAgo(ms: number) {
  if (ms < 1_000) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function LocationSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await apiFetch<SharePayload>(`/api/location-share/${token}`);
        if (cancelled) return;
        setData(result);
        setError("");
        activeRef.current = result.active;
      } catch (reason) {
        if (cancelled) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "This live location link is no longer available.",
        );
        activeRef.current = false;
      }
    }
    void poll();
    const interval = window.setInterval(() => {
      if (activeRef.current) void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="subpage share-page">
      <header className="subpage-header">
        <p className="eyebrow">Live location</p>
        <h1>
          <Share2 size={26} style={{ verticalAlign: "middle", marginRight: 10 }} />
          {data ? `${data.requesterName}'s location` : "Live location"}
        </h1>
        {data && (
          <>
            {data.active && (
              <div className="monitoring">
                <span /> Live
              </div>
            )}
            <p>
              {data.active
                ? `Updated ${formatAgo(now - new Date(data.lastUpdatedAt ?? data.expiresAt).getTime())} · expires ${new Date(data.expiresAt).toLocaleString()}`
                : "This live location share has ended."}
            </p>
          </>
        )}
      </header>
      {error && <p className="readiness-error">{error}</p>}
      {!error && !data && <div className="map-loading">Loading...</div>}
      {!error && data && data.location && (
        <article className="emergency-map-card">
          <MapPreview center={data.location.coordinates} label={data.requesterName} zoom={15} />
        </article>
      )}
      {!error && data && !data.location && (
        <p className="form-hint">No location has been received yet.</p>
      )}
    </main>
  );
}
