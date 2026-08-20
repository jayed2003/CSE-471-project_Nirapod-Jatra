"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matchSafeWord, type SafeWordSensitivity } from "@/lib/safe-word";

// The Web Speech API is not in TypeScript's DOM lib, so declare the slice we use.
type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSafeWordSupported() {
  return recognitionConstructor() !== null;
}

const MAX_CONSECUTIVE_RESTARTS = 25;
const RETRIGGER_COOLDOWN_MS = 60_000;

export type SafeWordListenerOptions = {
  enabled: boolean;
  phrase?: string;
  romanized?: string;
  sensitivity: SafeWordSensitivity;
  onMatch: (heard: string, confidence: number) => void;
};

export type SafeWordListenerState = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  lastHeard: string;
};

/**
 * Keeps a continuous bn-BD recognition session alive and fires `onMatch` when the transcript
 * contains the user's safe-word.
 *
 * Chrome ends a continuous session roughly every minute and on every silence timeout, so the
 * watchdog restart below is not defensive polish — without it the feature dies silently after
 * the first minute and the user has no way to tell.
 */
export function useSafeWordListener({
  enabled,
  phrase,
  romanized,
  sensitivity,
  onMatch,
}: SafeWordListenerOptions): SafeWordListenerState {
  const [supported] = useState(() => isSafeWordSupported());
  const [sessionLive, setSessionLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const activeRef = useRef(false);
  const restartsRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);
  const lastTriggerRef = useRef(0);
  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const Recognition = recognitionConstructor();
    if (!enabled || !Recognition || !phrase) {
      activeRef.current = false;
      clearRestartTimer();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      // `listening` is derived from `enabled` below, so there is nothing to reset here.
      return;
    }

    activeRef.current = true;
    restartsRef.current = 0;

    const recognition = new Recognition();
    recognition.lang = "bn-BD";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognitionRef.current = recognition;

    const start = () => {
      if (!activeRef.current) return;
      try {
        recognition.start();
      } catch {
        /* already started — the onend handler will retry */
      }
    };

    const scheduleRestart = () => {
      if (!activeRef.current) return;
      if (restartsRef.current >= MAX_CONSECUTIVE_RESTARTS) {
        setError("Voice listening stopped after repeated failures. Turn it off and on to retry.");
        setSessionLive(false);
        return;
      }
      const delay = Math.min(250 * 2 ** restartsRef.current, 4_000);
      restartsRef.current += 1;
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(start, delay);
    };

    recognition.onstart = () => {
      restartsRef.current = 0;
      setSessionLive(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        // Check every alternative: the top-ranked bn-BD transcript is often not the closest one.
        for (let alternative = 0; alternative < result.length; alternative += 1)
          transcript += ` ${result[alternative].transcript}`;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      setLastHeard(transcript.slice(-120));
      const confidence = matchSafeWord(transcript, phrase, sensitivity, romanized);
      if (!confidence) return;
      if (Date.now() - lastTriggerRef.current < RETRIGGER_COOLDOWN_MS) return;
      lastTriggerRef.current = Date.now();
      onMatchRef.current(transcript.slice(-120), confidence);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        activeRef.current = false;
        setError("Microphone access was blocked. Allow it in your browser to use the safe-word.");
        setSessionLive(false);
        return;
      }
      if (event.error === "audio-capture") {
        activeRef.current = false;
        setError("No microphone found.");
        setSessionLive(false);
        return;
      }
      // "no-speech", "network" and "aborted" are routine; onend fires next and restarts us.
      if (event.error === "network")
        setError("Speech recognition needs an internet connection. Retrying...");
    };

    recognition.onend = () => {
      setSessionLive(false);
      scheduleRestart();
    };

    start();

    return () => {
      activeRef.current = false;
      clearRestartTimer();
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        /* nothing to abort */
      }
      recognitionRef.current = null;
      setSessionLive(false);
    };
  }, [enabled, phrase, romanized, sensitivity, clearRestartTimer]);

  // Masked by `enabled` so a stale session flag never claims we are listening after disarming.
  return { supported, listening: enabled && sessionLive, error, lastHeard };
}
