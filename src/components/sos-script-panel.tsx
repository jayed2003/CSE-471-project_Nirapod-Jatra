"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  FALLBACK_SITUATIONS,
  generateSosScript,
  loadSituations,
  primeSosKit,
  type SituationOption,
  type SituationType,
  type SosScript,
} from "@/lib/sos-script";
import { SosScriptView, type ScriptContact } from "@/components/sos-script-view";

const KIT_REFRESH_MS = 3 * 60 * 1000;

export function SosScriptPanel({
  center,
  accuracyM,
  contacts,
  callerName,
}: {
  center: [number, number];
  accuracyM?: number;
  contacts: ScriptContact[];
  callerName: string;
}) {
  const [situations, setSituations] = useState<SituationOption[]>(FALLBACK_SITUATIONS);
  const [situationType, setSituationType] = useState<SituationType>("unknown");
  const [note, setNote] = useState("");
  const [script, setScript] = useState<SosScript | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState("");

  useEffect(() => {
    void loadSituations().then(setSituations);
  }, []);

  // Keep the offline kit warm while the page is open so a script can still be built with a
  // landmark in it if the network drops at the moment it is needed.
  useEffect(() => {
    const coordinates = { lat: center[1], lon: center[0] };
    void primeSosKit(coordinates);
    const timer = window.setInterval(() => {
      void primeSosKit(coordinates);
    }, KIT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [center]);

  async function generate() {
    setGenerating(true);
    setDispatchStatus("");
    const situation =
      situations.find((option) => option.type === situationType) ??
      FALLBACK_SITUATIONS[FALLBACK_SITUATIONS.length - 1];
    const generated = await generateSosScript({
      coordinates: { lat: center[1], lon: center[0], accuracyM },
      situation,
      note: note.trim() || undefined,
      callerName,
    });
    setScript(generated);
    setGenerating(false);
  }

  async function dispatch() {
    if (!script) return;
    setDispatchStatus("Alerting your emergency contacts...");
    try {
      const result = await apiFetch<{ contactsNotified: number; emailsSent: number }>("/api/sos", {
        method: "POST",
        body: JSON.stringify({
          location: { type: "Point", coordinates: [center[0], center[1]] },
          accuracyM,
          message: note.trim() || undefined,
          situationType,
          trigger: "button",
          script: {
            speech: script.speech,
            sms: script.sms,
            plain: script.plain,
            degraded: script.degraded,
          },
        }),
      });
      setDispatchStatus(
        result.contactsNotified === 0
          ? "SOS recorded. Add an emergency contact so someone gets notified next time."
          : `SOS recorded. Emailed ${result.emailsSent} of ${result.contactsNotified} contact(s). Use the SMS buttons below to text them too.`,
      );
    } catch {
      setDispatchStatus(
        "Offline — the SOS is queued and will send when the connection returns. Call 999 now using the script below.",
      );
    }
  }

  return (
    <article className="sos-script-card">
      <FileText size={28} />
      <h2>SOS script</h2>
      <p>
        Pick what is happening. We build the exact wording — GPS, nearest landmark, situation — to
        read to a 999 operator or text to your contacts.
      </p>

      <div className="situation-picker" role="radiogroup" aria-label="Situation type">
        {situations.map((option) => (
          <button
            key={option.type}
            type="button"
            role="radio"
            aria-checked={situationType === option.type}
            className={situationType === option.type ? "situation-chip selected" : "situation-chip"}
            onClick={() => {
              setSituationType(option.type);
              setScript(null);
            }}
          >
            <strong>{option.en}</strong>
            <span lang="bn">{option.bn}</span>
          </button>
        ))}
      </div>

      <label className="sos-note">
        <span>Anything else the operator should know? (optional)</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="e.g. two people injured, one unconscious"
        />
      </label>

      <button
        type="button"
        className="danger-button sos-generate"
        onClick={() => void generate()}
        disabled={generating}
      >
        {generating ? <Loader2 size={16} className="spinning" /> : <FileText size={16} />}{" "}
        {generating ? "Building script..." : "Generate SOS script"}
      </button>

      {script && (
        <>
          <SosScriptView script={script} contacts={contacts} />
          <button type="button" className="sos-dispatch" onClick={() => void dispatch()}>
            <Send size={15} /> Also alert my emergency contacts by email
          </button>
          {dispatchStatus && (
            <p className="sos-dispatch-status" role="status">
              {dispatchStatus}
            </p>
          )}
        </>
      )}
    </article>
  );
}
