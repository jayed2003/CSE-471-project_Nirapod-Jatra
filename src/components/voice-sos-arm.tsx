"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Mic, MicOff, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSafeWordListener } from "@/hooks/useSafeWordListener";
import { generateSosScript, loadSafeWordSuggestions, loadSituations, type SituationOption, type SituationType, type SosScript } from "@/lib/sos-script";
import { SosScriptView, type ScriptContact } from "@/components/sos-script-view";
import type { SafeWordSensitivity, SafeWordSetting } from "@/lib/safe-word";

const COUNTDOWN_SECONDS = 5;

const SENSITIVITY_HELP: Record<SafeWordSensitivity, string> = {
  low: "Strictest match. Fewest false alarms, but a slurred or rushed phrase may be missed.",
  normal: "Balanced. Recommended for most people.",
  high: "Loosest match. Catches distorted speech, but is more likely to fire by mistake.",
};

function alertUser() {
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  try {
    const context = new (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.12;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    oscillator.onended = () => void context.close();
  } catch {
    /* audio blocked before a user gesture — the vibration and overlay still fire */
  }
}

export function VoiceSosArm({
  center,
  accuracyM,
  contacts,
  callerName,
  initialSafeWord,
}: {
  center: [number, number] | null;
  accuracyM?: number;
  contacts: ScriptContact[];
  callerName: string;
  initialSafeWord: SafeWordSetting | null;
}) {
  const [phrase, setPhrase] = useState(initialSafeWord?.phrase ?? "");
  const [romanized, setRomanized] = useState(initialSafeWord?.romanized ?? "");
  const [sensitivity, setSensitivity] = useState<SafeWordSensitivity>(
    initialSafeWord?.sensitivity ?? "normal",
  );
  const [savedPhrase, setSavedPhrase] = useState(initialSafeWord?.phrase ?? "");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [armed, setArmed] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [situations, setSituations] = useState<SituationOption[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ phrase: string; romanized?: string }>>([]);
  const [voiceSituation, setVoiceSituation] = useState<SituationType>("unknown");

  const [countdown, setCountdown] = useState<number | null>(null);
  const [testHit, setTestHit] = useState<string | null>(null);
  const [firedScript, setFiredScript] = useState<SosScript | null>(null);
  const [fireStatus, setFireStatus] = useState("");
  const detectionRef = useRef<{ heard: string; confidence: number } | null>(null);

  useEffect(() => {
    void loadSituations().then(setSituations);
    void loadSafeWordSuggestions().then(setSuggestions);
  }, []);

  const dispatchVoiceSos = useCallback(async () => {
    const detection = detectionRef.current;
    setFireStatus("Building your SOS script...");
    const situation = situations.find((option) => option.type === voiceSituation) ?? null;
    const coordinates = center ? { lat: center[1], lon: center[0], accuracyM } : null;
    const script = coordinates && situation ? await generateSosScript({ coordinates, situation, callerName }) : null;
    setFiredScript(script);
    try {
      const result = await apiFetch<{ contactsNotified: number; emailsSent: number }>("/api/sos", {
        method: "POST",
        body: JSON.stringify({
          ...(center
            ? { location: { type: "Point", coordinates: [center[0], center[1]] }, accuracyM }
            : {}),
          message: "Voice safe-word SOS",
          situationType: voiceSituation,
          trigger: "voice",
          voice: detection
            ? { heardText: detection.heard, confidence: detection.confidence }
            : undefined,
          ...(script
            ? {
                script: {
                  speech: script.speech,
                  sms: script.sms,
                  plain: script.plain,
                  degraded: script.degraded,
                },
              }
            : {}),
        }),
      });
      setFireStatus(
        result.contactsNotified === 0
          ? "SOS recorded. No emergency contact is saved — call 999 with the script below."
          : `SOS sent. Emailed ${result.emailsSent} of ${result.contactsNotified} contact(s).`,
      );
    } catch {
      setFireStatus(
        "Offline — SOS queued and will send when the connection returns. Call 999 now using the script below.",
      );
    }
  }, [accuracyM, callerName, center, situations, voiceSituation]);

  const onMatch = useCallback(
    (heard: string, confidence: number) => {
      detectionRef.current = { heard, confidence };
      alertUser();
      if (testMode) {
        setTestHit(heard);
        window.setTimeout(() => setTestHit(null), 6000);
        return;
      }
      setCountdown(COUNTDOWN_SECONDS);
    },
    [testMode],
  );

  const { supported, listening, error, lastHeard, sessions } = useSafeWordListener({ enabled: armed && Boolean(savedPhrase), phrase: savedPhrase, romanized, sensitivity, onMatch });

  // Armed countdown, not a confirmation tap. The premise of a safe-word is that the user cannot
  // interact with the phone, so the alert must fire on its own; the window exists only to let a
  // misfire be cancelled.
  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void dispatchVoiceSos();
        return;
      }
      setCountdown(countdown - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, dispatchVoiceSos]);

  async function saveSafeWord() {
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch("/api/me/safe-word", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          phrase,
          romanized: romanized.trim() || undefined,
          sensitivity,
        }),
      });
      setSavedPhrase(phrase.trim());
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error ? saveFailure.message : "Could not save your safe-word.",
      );
    }
    setSaving(false);
  }

  return (
    <article className="voice-sos-card">
      <Mic size={28} />
      <h2>Voice SOS safe-word</h2>
      <p>
        Say a Bangla phrase out loud and the app sends your SOS — for moments when you can&apos;t
        type or unlock the screen.
      </p>

      {!supported && (
        <p className="voice-sos-warning">
          This browser can&apos;t listen for a safe-word. Use Chrome on Android or desktop. The SOS
          button and script still work everywhere.
        </p>
      )}

      <label className="voice-field">
        <span>Your safe-word (Bangla)</span>
        <input
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          maxLength={40}
          placeholder="নীল আকাশ"
          lang="bn"
        />
      </label>
      {suggestions.length > 0 && (
        <div className="voice-suggestions">
          <span>Suggestions:</span>
          {suggestions.map((suggestion) => (
            <button key={suggestion.phrase} type="button" className="text-button" lang="bn" onClick={() => { setPhrase(suggestion.phrase); if (suggestion.romanized) setRomanized(suggestion.romanized); }}>{suggestion.phrase}</button>
          ))}
        </div>
      )}
      <p className="voice-hint">Pick something you would never say by accident — and that won&apos;t alarm anyone standing next to you.</p>

      <label className="voice-field">
        <span>Also match this spelling (optional)</span>
        <input
          value={romanized}
          onChange={(event) => setRomanized(event.target.value)}
          maxLength={60}
          placeholder="nil akash"
        />
        <small>
          Bangla recognition sometimes returns English letters. Adding the spelling catches those
          too.
        </small>
      </label>

      <label className="voice-field">
        <span>Sensitivity</span>
        <select
          value={sensitivity}
          onChange={(event) => setSensitivity(event.target.value as SafeWordSensitivity)}
        >
          <option value="low">Low — strictest</option>
          <option value="normal">Normal — recommended</option>
          <option value="high">High — loosest</option>
        </select>
        <small>{SENSITIVITY_HELP[sensitivity]}</small>
      </label>

      <label className="voice-field">
        <span>What should a voice SOS report?</span>
        <select
          value={voiceSituation}
          onChange={(event) => setVoiceSituation(event.target.value as SituationType)}
        >
          {situations.map((option) => (
            <option key={option.type} value={option.type}>
              {option.en}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={() => void saveSafeWord()} disabled={saving || !phrase.trim()}>
        <ShieldCheck size={15} /> {saving ? "Saving..." : "Save safe-word"}
      </button>
      {saveError && (
        <p className="voice-sos-warning" role="alert">
          {saveError}
        </p>
      )}

      {savedPhrase && supported && (
        <div className="voice-arm-row">
          <button
            type="button"
            className={armed ? "voice-arm armed" : "voice-arm"}
            onClick={() => {
              setArmed((value) => !value);
              setTestHit(null);
            }}
          >
            {armed ? <MicOff size={15} /> : <Mic size={15} />}{" "}
            {armed ? "Stop listening" : "Arm voice SOS"}
          </button>
          <label className="voice-test">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(event) => setTestMode(event.target.checked)}
            />
            Test mode — detect only, send nothing
          </label>
        </div>
      )}

      {armed && (
        <div className="voice-status" role="status">
          <span className={listening ? "voice-dot live" : "voice-dot"} />
          {listening ? "Listening for your safe-word" : "Reconnecting to the microphone..."}
          {/* Session count makes the restart loop visible — a number that keeps climbing means
              the watchdog is working, not that something is broken. */}
          <small>Session #{sessions} · say your phrase clearly, then pause</small>
          {lastHeard && <small lang="bn">Heard: {lastHeard}</small>}
        </div>
      )}
      {armed && (
        <p className="voice-hint">
          Your microphone is on and speech is sent to your browser&apos;s recognition service for
          transcription. Listening stops when you leave this page or lock the screen.
        </p>
      )}
      {error && (
        <p className="voice-sos-warning" role="alert">
          {error}
        </p>
      )}
      {testHit && (
        <p className="voice-detected">
          <CheckCircle2 size={15} /> Safe-word detected. Nothing was sent (test mode).
        </p>
      )}

      {countdown !== null && (
        <div
          className="sos-countdown-overlay"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Voice SOS triggered"
        >
          <div className="sos-countdown">
            <strong>Safe-word detected</strong>
            <div className="sos-countdown-number">{countdown}</div>
            <p>Sending your SOS and building the 999 script.</p>
            <button
              type="button"
              className="confirm-no"
              onClick={() => {
                setCountdown(null);
                detectionRef.current = null;
              }}
            >
              <X size={15} /> Cancel — I&apos;m safe
            </button>
          </div>
        </div>
      )}

      {(firedScript || fireStatus) && (
        <div className="voice-fired">
          <h3>Voice SOS sent</h3>
          {fireStatus && <p role="status">{fireStatus}</p>}
          {firedScript ? (
            <SosScriptView script={firedScript} contacts={contacts} compact />
          ) : (
            <p>
              Your location wasn&apos;t available, so no script could be built. Call 999 and
              describe where you are.
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setFiredScript(null);
              setFireStatus("");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </article>
  );
}
