import { apiFetch } from "@/lib/api-client";
import { cacheValue, readCachedValue } from "@/lib/offline";

export type SituationType = "medical" | "accident" | "fire" | "flood" | "crime" | "harassment" | "stranded" | "unknown";
export type SituationOption = { type: SituationType; bn: string; en: string; service: string; serviceBn: string };
export type Landmark = { name: string; category: string; point: [number, number]; distanceM: number; bearingBn: string; bearingEn: string };

export type SosScript = {
  speech: string;
  sms: string;
  smsLatin: string;
  plain: string;
  degraded: boolean;
  generatedAt: string;
  facts: {
    callerName: string;
    callerPhone?: string;
    coordinates: { lat: number; lon: number; accuracyM?: number };
    mapsUrl: string;
    address: { road?: string; area?: string; city?: string; displayName: string } | null;
    landmark: Landmark | null;
    alternatives: Landmark[];
    situation: { type: SituationType; bn: string; en: string; service: string; serviceBn: string };
    nearestHospital: { name: string; distanceKm: number } | null;
    note?: string;
    followUpBn: string[];
    followUpEn: string[];
  };
};

const KIT_KEY = "sos-kit";
const SITUATIONS_KEY = "sos-situations";
const SUGGESTIONS_KEY = "safe-word-suggestions";
// Reuse a cached landmark only while the user is plausibly still beside it.
const KIT_REUSE_METERS = 600;

type SosKit = { point: [number, number]; callerName: string; address: SosScript["facts"]["address"]; landmark: Landmark | null; savedAt: number };

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const BN_DIGIT_WORDS = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"];
const toBanglaDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => BN_DIGITS[Number(digit)]);
const speakCoordinateBn = (value: number) => value.toFixed(4).split("").map((character) => character === "." ? "দশমিক" : character === "-" ? "ঋণাত্মক" : BN_DIGIT_WORDS[Number(character)]).join(" ");

function haversineMeters(a: [number, number], b: [number, number]) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const sine = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(sine), Math.sqrt(1 - sine));
}

/**
 * Loads the situation catalogue from the API, which reads it from the `situations` collection in
 * MongoDB. The IndexedDB copy is a cache of that response — not a hardcoded list — so an offline
 * device still shows what the database last said. Returns [] if it has never been online.
 */
export async function loadSituations(): Promise<SituationOption[]> {
  try {
    const result = await apiFetch<{ situations: SituationOption[] }>("/api/sos/situations");
    await cacheValue(SITUATIONS_KEY, result.situations);
    return result.situations;
  } catch {
    return (await readCachedValue<SituationOption[]>(SITUATIONS_KEY)) ?? [];
  }
}

export async function loadSafeWordSuggestions(): Promise<Array<{ phrase: string; romanized?: string }>> {
  try {
    const result = await apiFetch<{ suggestions: Array<{ phrase: string; romanized?: string }> }>("/api/safe-word/suggestions");
    await cacheValue(SUGGESTIONS_KEY, result.suggestions);
    return result.suggestions;
  } catch {
    return (await readCachedValue<Array<{ phrase: string; romanized?: string }>>(SUGGESTIONS_KEY)) ?? [];
  }
}

/**
 * Builds the script offline from the last cached landmark/address plus a fresh GPS fix. Always
 * flagged degraded — coordinates are exact but the surrounding context may be minutes old.
 */
export function composeOfflineScript(input: {
  coordinates: { lat: number; lon: number; accuracyM?: number };
  situation: SituationOption;
  callerName: string;
  note?: string;
  kit: SosKit | null;
}): SosScript {
  const { coordinates, situation, callerName, note } = input;
  const kitPoint: [number, number] = [coordinates.lon, coordinates.lat];
  const usable = input.kit && haversineMeters(input.kit.point, kitPoint) <= KIT_REUSE_METERS ? input.kit : null;
  const landmark = usable?.landmark ?? null;
  const place = usable?.address ? [usable.address.road, usable.address.area, usable.address.city].filter(Boolean).join(", ") : null;
  const mapsUrl = `https://www.google.com/maps?q=${coordinates.lat.toFixed(5)},${coordinates.lon.toFixed(5)}`;

  const speech = [
    `জরুরি সাহায্য দরকার। আমি ${callerName}। এটি একটি ${situation.bn}।`,
    place ? `আমার অবস্থান ${place}।` : null,
    landmark ? `কাছের পরিচিত জায়গা ${landmark.name} — সেখান থেকে প্রায় ${toBanglaDigits(landmark.distanceM)} মিটার ${landmark.bearingBn}।` : null,
    `জিপিএস অক্ষাংশ ${speakCoordinateBn(coordinates.lat)}, দ্রাঘিমাংশ ${speakCoordinateBn(coordinates.lon)}।`,
    note ? `অতিরিক্ত তথ্য: ${note}।` : null,
    `দয়া করে ${situation.serviceBn} পাঠান।`,
  ].filter(Boolean).join(" ");

  const sms = `জরুরি: ${situation.bn}। ${callerName}। ${mapsUrl}`.slice(0, 140);
  const plain = [
    `EMERGENCY SOS — ${situation.en.toUpperCase()} (${situation.bn})`,
    `Person: ${callerName}`,
    `GPS: ${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}${coordinates.accuracyM ? ` (±${Math.round(coordinates.accuracyM)} m)` : ""}`,
    place ? `Address (cached): ${place}` : "Address: not resolved",
    landmark ? `Nearest landmark (cached): ${landmark.name}, about ${landmark.distanceM} m ${landmark.bearingEn} of it` : "Nearest landmark: not confirmed",
    note ? `Note: ${note}` : null,
    `Map: ${mapsUrl}`,
    "NOTE: generated offline — coordinates are exact, surrounding detail may be out of date.",
  ].filter(Boolean).join("\n");

  return {
    speech, sms, smsLatin: `SOS: ${situation.en}. ${callerName}. ${mapsUrl}`, plain,
    degraded: true, generatedAt: new Date().toISOString(),
    facts: {
      callerName, coordinates, mapsUrl, address: usable?.address ?? null, landmark, alternatives: [],
      situation: { type: situation.type, bn: situation.bn, en: situation.en, service: situation.service, serviceBn: situation.serviceBn },
      nearestHospital: null, note, followUpBn: [], followUpEn: [],
    },
  };
}

export async function readSosKit() {
  return readCachedValue<SosKit>(KIT_KEY);
}

/**
 * Asks the API for the script, falling back to the offline composer when the network is down —
 * which is exactly when this feature matters most.
 */
export async function generateSosScript(input: { coordinates: { lat: number; lon: number; accuracyM?: number }; situation: SituationOption; note?: string; callerName: string }): Promise<SosScript> {
  const { coordinates, situation, note } = input;
  try {
    const script = await apiFetch<SosScript>("/api/sos/script", {
      method: "POST",
      body: JSON.stringify({ location: coordinates, situationType: situation.type, note, language: "bn" }),
    });
    await cacheValue<SosKit>(KIT_KEY, { point: [coordinates.lon, coordinates.lat], callerName: script.facts.callerName, address: script.facts.address, landmark: script.facts.landmark, savedAt: Date.now() });
    return script;
  } catch {
    return composeOfflineScript({ ...input, kit: await readSosKit() });
  }
}

/**
 * Warms the landmark/address cache for the current position so an offline SOS still has
 * something to say beyond raw coordinates. Safe to call repeatedly; the API caches per ~110 m.
 */
export async function primeSosKit(coordinates: { lat: number; lon: number }) {
  try {
    const script = await apiFetch<SosScript>("/api/sos/script", { method: "POST", body: JSON.stringify({ location: coordinates, situationType: "unknown", language: "bn" }) });
    await cacheValue<SosKit>(KIT_KEY, { point: [coordinates.lon, coordinates.lat], callerName: script.facts.callerName, address: script.facts.address, landmark: script.facts.landmark, savedAt: Date.now() });
    return true;
  } catch { return false; }
}

export function smsHref(phone: string, body: string) {
  // iOS wants sms:number&body=, Android wants sms:number?body= — the "?" form is the one both
  // modern WebKit and Chrome accept, so use it and let the user tap send in their own composer.
  return `sms:${phone.replace(/\s+/g, "")}?body=${encodeURIComponent(body)}`;
}
