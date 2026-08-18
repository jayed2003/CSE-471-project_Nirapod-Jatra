"use client";

import { useEffect, useState } from "react";
import { Copy, MessageSquare, Phone, Volume2, VolumeX } from "lucide-react";
import { smsHref, type SosScript } from "@/lib/sos-script";

export type ScriptContact = { _id?: string; name: string; phone: string };

function speak(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "bn-BD";
  utterance.rate = 0.9;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Renders a generated SOS script in the form it is meant to be used: large readable text to
 * read aloud to a 999 operator, plus one-tap dial and prefilled SMS drafts per contact.
 */
export function SosScriptView({ script, contacts, compact = false }: { script: SosScript; contacts: ScriptContact[]; compact?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callTarget, setCallTarget] = useState<{ label: string; number: string } | null>(null);

  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  function toggleSpeech() {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    if (speak(script.speech, () => setSpeaking(false))) setSpeaking(true);
  }

  async function copyScript() {
    try { await navigator.clipboard.writeText(script.plain); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked — the text is on screen to read */ }
  }

  const { facts } = script;

  return (
    <div className="sos-script">
      {script.degraded && (
        <p className="sos-script-degraded">
          Landmark and address lookup was unavailable, so this script has coordinates only. The GPS numbers below are still exact — read them out.
        </p>
      )}

      <div className="sos-script-speech" lang="bn">
        <div className="sos-script-heading">
          <span>Read this to the 999 operator</span>
          <button type="button" className="text-button" onClick={toggleSpeech}>
            {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />} {speaking ? "Stop" : "Play aloud"}
          </button>
        </div>
        <p>{script.speech}</p>
      </div>

      <dl className="sos-script-facts">
        <div><dt>GPS</dt><dd>{facts.coordinates.lat.toFixed(5)}, {facts.coordinates.lon.toFixed(5)}{facts.coordinates.accuracyM ? ` (±${Math.round(facts.coordinates.accuracyM)} m)` : ""}</dd></div>
        <div><dt>Landmark</dt><dd>{facts.landmark ? `${facts.landmark.name} — ${facts.landmark.distanceM} m ${facts.landmark.bearingEn} of it` : "Not confirmed"}</dd></div>
        {facts.alternatives.length > 0 && (
          // The top-ranked landmark is sometimes one only locals know. Showing the runners-up
          // lets the caller name whichever one the operator actually recognises.
          <div><dt>Or mention</dt><dd>{facts.alternatives.map((alternative) => `${alternative.name} (${alternative.distanceM} m)`).join(" · ")}</dd></div>
        )}
        <div><dt>Situation</dt><dd>{facts.situation.en} · {facts.situation.bn}</dd></div>
        {facts.nearestHospital && <div><dt>Nearest hospital</dt><dd>{facts.nearestHospital.name} ({facts.nearestHospital.distanceKm} km)</dd></div>}
      </dl>

      {!compact && facts.followUpBn.length > 0 && (
        <div className="sos-script-followup">
          <span>The operator will likely ask next</span>
          <ul lang="bn">{facts.followUpBn.map((question) => <li key={question}>{question}</li>)}</ul>
        </div>
      )}

      <div className="sos-script-actions">
        <button type="button" className="danger-button" onClick={() => setCallTarget({ label: "National Emergency Hotline", number: "999" })}>
          <Phone size={16} /> Call 999
        </button>
        <button type="button" className="text-button" onClick={() => void copyScript()}>
          <Copy size={14} /> {copied ? "Copied" : "Copy full details"}
        </button>
      </div>

      <div className="sos-script-sms">
        <span>Send by SMS ({script.sms.length} characters)</span>
        {contacts.length === 0 && <p className="sos-script-empty">No emergency contact saved yet. Add one in your account to enable one-tap SMS.</p>}
        {contacts.map((contact) => (
          <a key={contact._id ?? contact.phone} className="sos-sms-link" href={smsHref(contact.phone, script.sms)}>
            <MessageSquare size={14} /> <strong>{contact.name}</strong> <span>{contact.phone}</span>
          </a>
        ))}
        {contacts.length > 0 && <small>Opens your phone&apos;s messaging app with the text ready — you tap send.</small>}
      </div>

      {callTarget && (
        <div className="confirm-overlay" onClick={() => setCallTarget(null)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sos-call-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="sos-call-title">Call {callTarget.label}?</h3>
            <p>You&apos;re about to dial <strong>{callTarget.number}</strong>. Keep this screen open — the script stays here while you talk.</p>
            <div className="confirm-actions">
              <button className="confirm-no" onClick={() => setCallTarget(null)}>Cancel</button>
              <button className="confirm-go" onClick={() => { window.location.href = `tel:${callTarget.number}`; setCallTarget(null); }}><Phone size={14} /> Call</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
