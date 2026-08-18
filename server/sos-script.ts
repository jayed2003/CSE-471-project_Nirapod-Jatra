import { z } from "zod";
import { haversineKm, nearestHospital, OVERPASS_INSTANCES } from "./warnings.js";

export type SituationType = "medical" | "accident" | "fire" | "flood" | "crime" | "harassment" | "stranded" | "unknown";
export type ScriptLanguage = "bn" | "en" | "both";

export type Landmark = { name: string; category: string; point: [number, number]; distanceM: number; bearingBn: string; bearingEn: string };
export type ScriptAddress = { road?: string; area?: string; city?: string; displayName: string };

export type SosScriptFacts = {
	callerName: string;
	callerPhone?: string;
	coordinates: { lat: number; lon: number; accuracyM?: number };
	mapsUrl: string;
	address: ScriptAddress | null;
	landmark: Landmark | null;
	/** Runners-up, offered so the caller can name one the operator actually recognises. */
	alternatives: Landmark[];
	situation: { type: SituationType; bn: string; en: string; service: ServiceKey; serviceBn: string };
	nearestHospital: { name: string; distanceKm: number } | null;
	note?: string;
	followUpBn: string[];
	followUpEn: string[];
};

export type SosScript = {
	speech: string;
	sms: string;
	smsLatin: string;
	plain: string;
	facts: SosScriptFacts;
	degraded: boolean;
	generatedAt: string;
};

type ServiceKey = "ambulance" | "police" | "fire" | "any";

export const SITUATION_TYPES = ["medical", "accident", "fire", "flood", "crime", "harassment", "stranded", "unknown"] as const;

// Fixed phrasing per situation. Deliberately a static table and not generated text: the
// sentence a 999 operator hears must be identical every time so it is never ambiguous.
export const SITUATIONS: Record<SituationType, { bn: string; en: string; service: ServiceKey; serviceBn: string; followUpBn: string[]; followUpEn: string[] }> = {
	medical: { bn: "চিকিৎসা জরুরি অবস্থা", en: "medical emergency", service: "ambulance", serviceBn: "অ্যাম্বুলেন্স", followUpBn: ["রোগীর বয়স কত?", "রোগী কি জ্ঞান হারিয়েছে?", "শ্বাস নিতে পারছে কি?"], followUpEn: ["How old is the patient?", "Is the patient conscious?", "Are they breathing?"] },
	accident: { bn: "সড়ক দুর্ঘটনা", en: "road accident", service: "ambulance", serviceBn: "অ্যাম্বুলেন্স", followUpBn: ["কতজন আহত?", "কেউ কি গাড়িতে আটকে আছে?", "রাস্তা কি বন্ধ হয়ে গেছে?"], followUpEn: ["How many people are injured?", "Is anyone trapped in a vehicle?", "Is the road blocked?"] },
	fire: { bn: "আগুন লেগেছে", en: "fire", service: "fire", serviceBn: "ফায়ার সার্ভিস", followUpBn: ["আগুন কোন তলায়?", "ভেতরে কেউ আটকে আছে?", "গ্যাস সিলিন্ডার আছে কি?"], followUpEn: ["Which floor is the fire on?", "Is anyone trapped inside?", "Are there gas cylinders nearby?"] },
	flood: { bn: "বন্যার পানিতে আটকে আছি", en: "trapped by floodwater", service: "fire", serviceBn: "ফায়ার সার্ভিস", followUpBn: ["পানির উচ্চতা কত?", "সাথে কতজন আছেন?", "শিশু বা বয়স্ক কেউ আছে?"], followUpEn: ["How deep is the water?", "How many people are with you?", "Any children or elderly?"] },
	crime: { bn: "আমি আক্রমণের শিকার হয়েছি", en: "assault or crime in progress", service: "police", serviceBn: "পুলিশ", followUpBn: ["আক্রমণকারী কি এখনো সেখানে আছে?", "কেউ কি আহত?", "অস্ত্র আছে কি?"], followUpEn: ["Is the attacker still there?", "Is anyone injured?", "Are there weapons?"] },
	harassment: { bn: "আমি হয়রানির শিকার হচ্ছি এবং নিরাপদ বোধ করছি না", en: "harassment, I do not feel safe", service: "police", serviceBn: "পুলিশ", followUpBn: ["আপনি কি এখন নিরাপদ জায়গায় আছেন?", "অভিযুক্তকে চেনেন?", "আশেপাশে লোকজন আছে?"], followUpEn: ["Are you somewhere safe right now?", "Do you know the person?", "Are there other people around?"] },
	stranded: { bn: "আমি আটকে পড়েছি, নিরাপদ জায়গায় যেতে পারছি না", en: "stranded and unable to reach safety", service: "any", serviceBn: "জরুরি সেবা", followUpBn: ["সাথে কতজন আছেন?", "খাবার ও পানি আছে কি?", "ফোনের চার্জ কতটুকু?"], followUpEn: ["How many people are with you?", "Do you have food and water?", "How much phone battery is left?"] },
	unknown: { bn: "জরুরি অবস্থা", en: "emergency", service: "any", serviceBn: "জরুরি সেবা", followUpBn: ["ঠিক কী ঘটেছে?", "কেউ কি আহত?", "আপনি কি নিরাপদ?"], followUpEn: ["What exactly happened?", "Is anyone injured?", "Are you safe?"] },
};

export const sosScriptSchema = z.object({
	location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), accuracyM: z.number().nonnegative().optional() }),
	situationType: z.enum(SITUATION_TYPES).default("unknown"),
	note: z.string().max(200).optional(),
	callerPhone: z.string().max(30).optional(),
	language: z.enum(["bn", "en", "both"]).default("bn"),
});

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const BN_DIGIT_WORDS = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"];
const BEARINGS_BN = ["উত্তরে", "উত্তর-পূর্বে", "পূর্বে", "দক্ষিণ-পূর্বে", "দক্ষিণে", "দক্ষিণ-পশ্চিমে", "পশ্চিমে", "উত্তর-পশ্চিমে"];
const BEARINGS_EN = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export function toBanglaDigits(value: string | number) {
	return String(value).replace(/\d/g, (digit) => BN_DIGITS[Number(digit)]);
}

// Speak coordinates digit by digit. A bn-BD voice reading "23.7806" as a single number is
// close to unusable over a phone line; "তেইশ দশমিক সাত আট শূন্য ছয়" is transcribed correctly.
export function speakCoordinateBn(value: number) {
	return value.toFixed(4).split("").map((character) => character === "." ? "দশমিক" : character === "-" ? "ঋণাত্মক" : BN_DIGIT_WORDS[Number(character)]).join(" ");
}

export function speakCoordinateEn(value: number) {
	return value.toFixed(4).split("").map((character) => character === "." ? "point" : character === "-" ? "minus" : character).join(" ");
}

// Compass direction of `to` as seen from `from`. Callers wanting "the user is 200m north of
// the landmark" must pass the landmark first — the reverse reads backwards to an operator.
export function bearingBetween(from: [number, number], to: [number, number]) {
	const toRadians = (degrees: number) => degrees * Math.PI / 180;
	const deltaLongitude = toRadians(to[0] - from[0]);
	const y = Math.sin(deltaLongitude) * Math.cos(toRadians(to[1]));
	const x = Math.cos(toRadians(from[1])) * Math.sin(toRadians(to[1])) - Math.sin(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.cos(deltaLongitude);
	const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
	const index = Math.round(degrees / 45) % 8;
	return { bearingBn: BEARINGS_BN[index], bearingEn: BEARINGS_EN[index] };
}

export function mapsUrlFor(latitude: number, longitude: number) {
	return `https://www.google.com/maps?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

// Weighted by how useful the category is as a spoken reference point, not just proximity:
// a named mosque 300 m away beats an unnamed clinic 80 m away when you are on the phone.
const LANDMARK_WEIGHT: Record<string, number> = {
	place_of_worship: 1, school: 0.95, college: 0.95, university: 0.95, hospital: 0.9, police: 0.9,
	bus_station: 0.85, marketplace: 0.8, fuel: 0.75, bus_stop: 0.7, supermarket: 0.65, bank: 0.6, bridge: 0.85,
};

function landmarkCategory(elementTags: Record<string, string>) {
	return elementTags.amenity ?? elementTags.shop ?? elementTags.man_made ?? (elementTags.highway === "bus_stop" ? "bus_stop" : undefined) ?? "place";
}

// OSM is full of names that describe a facility rather than identify it — "Prayer Place for
// Females", "Staff Canteen", "Ladies Toilet". They are useless over the phone, so a landmark
// needs at least one token that is not a generic descriptor to be treated as recognisable.
const GENERIC_NAME_TOKENS = new Set([
	"prayer", "namaz", "place", "room", "hall", "building", "block", "centre", "center", "complex",
	"mosque", "masjid", "jame", "eidgah", "temple", "mandir", "church", "shrine",
	"school", "college", "university", "hospital", "clinic", "health", "medical", "pharmacy",
	"police", "fire", "station", "stop", "stand", "terminal", "depot", "market", "bazar", "bazaar",
	"toilet", "washroom", "canteen", "office", "shop", "store", "bank", "atm", "pump", "filling", "fuel",
	"for", "the", "of", "and", "at", "in", "on", "a", "an",
	"female", "females", "male", "males", "women", "womens", "men", "mens", "ladies", "gents",
	"main", "new", "old", "no", "number", "public", "general", "central", "govt", "government",
]);

export function isRecognisableName(name: string) {
	return name.split(/[\s,'-]+/).some((token) => token.length > 2 && !GENERIC_NAME_TOKENS.has(token.toLowerCase()));
}

export async function fetchLandmarks(point: [number, number], radiusMeters = 600, limit = 3): Promise<Landmark[]> {
	const [longitude, latitude] = point;
	const around = `around:${radiusMeters},${latitude},${longitude}`;
	const query = `[out:json][timeout:15];(nwr[amenity~"^(place_of_worship|school|college|university|hospital|police|fuel|marketplace|bus_station)$"][name](${around});nwr[shop=supermarket][name](${around});nwr[highway=bus_stop][name](${around});nwr[man_made=bridge][name](${around}););out center tags;`;
	const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6_000));
	const attempt = (async () => {
		for (const instance of OVERPASS_INSTANCES) {
			try {
				const upstream = await fetch(instance, { method: "POST", headers: { "content-type": "text/plain", "user-agent": "WaymarkSafety/1.0 (local development)" }, body: query, signal: AbortSignal.timeout(6_000) });
				if (!upstream.ok) continue;
				const body = await upstream.json() as { elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
				const scored: Array<{ landmark: Landmark; score: number }> = [];
				for (const element of body.elements) {
					const elementTags = element.tags ?? {};
					const name = elementTags.name;
					const elementLatitude = element.lat ?? element.center?.lat;
					const elementLongitude = element.lon ?? element.center?.lon;
					if (!name || elementLatitude === undefined || elementLongitude === undefined) continue;
					const landmarkPoint: [number, number] = [elementLongitude, elementLatitude];
					const distanceKm = haversineKm(point, landmarkPoint);
					const category = landmarkCategory(elementTags);
					// Bearing runs landmark -> user, so the script reads "X metres north OF the landmark".
					const { bearingBn, bearingEn } = bearingBetween(landmarkPoint, point);
					const recognisability = isRecognisableName(name) ? 1 : 0.25;
					scored.push({ landmark: { name, category, point: landmarkPoint, distanceM: Math.round(distanceKm * 1000), bearingBn, bearingEn }, score: (LANDMARK_WEIGHT[category] ?? 0.5) * recognisability / (1 + distanceKm) });
				}
				if (scored.length) return scored.sort((left, right) => right.score - left.score).slice(0, limit).map((entry) => entry.landmark);
			} catch { continue; }
		}
		return null;
	})();
	return (await Promise.race([attempt, deadline])) ?? [];
}

const reverseGeocodeCache = new Map<string, { savedAt: number; address: ScriptAddress | null }>();
const REVERSE_GEOCODE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export async function reverseGeocode(latitude: number, longitude: number): Promise<ScriptAddress | null> {
	const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
	const cached = reverseGeocodeCache.get(cacheKey);
	if (cached && Date.now() - cached.savedAt < REVERSE_GEOCODE_CACHE_MS) return cached.address;
	try {
		const upstream = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${latitude}&lon=${longitude}`, { headers: { "accept-language": "en", "user-agent": "WaymarkSafety/1.0 (local development)" }, signal: AbortSignal.timeout(6_000) });
		if (!upstream.ok) return null;
		const body = await upstream.json() as { display_name?: string; address?: Record<string, string> };
		if (!body.display_name) return null;
		const parts = body.address ?? {};
		const address: ScriptAddress = {
			road: parts.road ?? parts.pedestrian ?? parts.residential,
			area: parts.suburb ?? parts.neighbourhood ?? parts.quarter ?? parts.village ?? parts.town,
			city: parts.city ?? parts.state_district ?? parts.district ?? parts.state,
			displayName: body.display_name,
		};
		reverseGeocodeCache.set(cacheKey, { savedAt: Date.now(), address });
		return address;
	} catch { return null; }
}

export function shortAddress(address: ScriptAddress | null) {
	if (!address) return null;
	const parts = [address.road, address.area, address.city].filter((part): part is string => Boolean(part));
	return parts.length ? [...new Set(parts)].join(", ") : address.displayName.split(",").slice(0, 3).join(",").trim();
}

// A single SMS segment holds 160 GSM-7 characters but only 70 in UCS-2, which is what any
// Bangla character forces. Two segments is the practical ceiling before delivery gets flaky.
const SMS_BANGLA_LIMIT = 140;
const SMS_LATIN_LIMIT = 300;

function clamp(text: string, limit: number) {
	return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function composeSosScript(facts: SosScriptFacts, language: ScriptLanguage, degraded: boolean): SosScript {
	const { coordinates, landmark, situation, callerName, callerPhone, note } = facts;
	const place = shortAddress(facts.address);
	const distanceBn = landmark ? toBanglaDigits(landmark.distanceM) : "";

	const banglaLines = [
		`জরুরি সাহায্য দরকার। আমি ${callerName}। এটি একটি ${situation.bn}।`,
		place ? `আমার অবস্থান ${place}।` : null,
		landmark ? `কাছের পরিচিত জায়গা ${landmark.name} — সেখান থেকে প্রায় ${distanceBn} মিটার ${landmark.bearingBn}।` : "কাছাকাছি কোনো পরিচিত চিহ্ন নিশ্চিত করা যায়নি।",
		`জিপিএস অক্ষাংশ ${speakCoordinateBn(coordinates.lat)}, দ্রাঘিমাংশ ${speakCoordinateBn(coordinates.lon)}।`,
		note ? `অতিরিক্ত তথ্য: ${note}।` : null,
		callerPhone ? `আমার ফোন নম্বর ${toBanglaDigits(callerPhone)}।` : null,
		`দয়া করে ${situation.serviceBn} পাঠান।`,
	].filter((line): line is string => Boolean(line));

	const englishLines = [
		`I need emergency help. My name is ${callerName}. This is a ${situation.en}.`,
		place ? `My location is ${place}.` : null,
		landmark ? `The nearest landmark is ${landmark.name} — about ${landmark.distanceM} metres ${landmark.bearingEn} of it.` : "No nearby landmark could be confirmed.",
		`GPS latitude ${speakCoordinateEn(coordinates.lat)}, longitude ${speakCoordinateEn(coordinates.lon)}.`,
		note ? `Additional detail: ${note}.` : null,
		callerPhone ? `My phone number is ${callerPhone}.` : null,
		`Please send ${situation.service === "any" ? "emergency services" : situation.service}.`,
	].filter((line): line is string => Boolean(line));

	const speech = language === "en" ? englishLines.join(" ") : language === "both" ? `${banglaLines.join(" ")}\n\n${englishLines.join(" ")}` : banglaLines.join(" ");

	const landmarkSms = landmark ? `${landmark.name} theke ~${landmark.distanceM}m ${landmark.bearingEn}. ` : "";
	const smsLatin = clamp(`SOS: ${situation.en}. ${callerName}. ${landmarkSms}${place ? `${place}. ` : ""}${facts.mapsUrl}`, SMS_LATIN_LIMIT);
	const smsBangla = clamp(`জরুরি: ${situation.bn}। ${callerName}। ${landmark ? `${landmark.name} থেকে ${distanceBn} মি ${landmark.bearingBn}। ` : ""}${facts.mapsUrl}`, SMS_BANGLA_LIMIT);
	const sms = language === "en" ? smsLatin : smsBangla;

	const plain = [
		`EMERGENCY SOS — ${situation.en.toUpperCase()} (${situation.bn})`,
		`Person: ${callerName}${callerPhone ? ` · ${callerPhone}` : ""}`,
		`GPS: ${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}${coordinates.accuracyM ? ` (±${Math.round(coordinates.accuracyM)} m)` : ""}`,
		place ? `Address: ${place}` : "Address: not resolved",
		landmark ? `Nearest landmark: ${landmark.name}, about ${landmark.distanceM} m ${landmark.bearingEn} of it` : "Nearest landmark: not confirmed",
		facts.alternatives.length ? `Other landmarks: ${facts.alternatives.map((alternative) => `${alternative.name} (${alternative.distanceM} m)`).join("; ")}` : null,
		facts.nearestHospital ? `Nearest hospital: ${facts.nearestHospital.name} (${facts.nearestHospital.distanceKm} km)` : null,
		note ? `Note: ${note}` : null,
		`Map: ${facts.mapsUrl}`,
		degraded ? "NOTE: landmark/address lookup was unavailable — coordinates are still exact." : null,
	].filter((line): line is string => Boolean(line)).join("\n");

	return { speech, sms, smsLatin, plain, facts, degraded, generatedAt: new Date().toISOString() };
}

export async function buildSosScript(input: z.infer<typeof sosScriptSchema> & { callerName: string }): Promise<SosScript> {
	const { lat, lon, accuracyM } = input.location;
	const point: [number, number] = [lon, lat];
	const [address, landmarks, hospital] = await Promise.all([
		reverseGeocode(lat, lon),
		fetchLandmarks(point),
		nearestHospital(point).catch(() => null),
	]);
	const situationEntry = SITUATIONS[input.situationType];
	const facts: SosScriptFacts = {
		callerName: input.callerName,
		callerPhone: input.callerPhone,
		coordinates: { lat, lon, accuracyM },
		mapsUrl: mapsUrlFor(lat, lon),
		address,
		landmark: landmarks[0] ?? null,
		alternatives: landmarks.slice(1),
		situation: { type: input.situationType, bn: situationEntry.bn, en: situationEntry.en, service: situationEntry.service, serviceBn: situationEntry.serviceBn },
		nearestHospital: hospital ? { name: hospital.name, distanceKm: hospital.distanceKm } : null,
		note: input.note,
		followUpBn: situationEntry.followUpBn,
		followUpEn: situationEntry.followUpEn,
	};
	// Coordinates are always exact; "degraded" means the human-readable context around them
	// could not be verified, which the caller must be able to say out loud.
	const degraded = !address && !facts.landmark;
	return composeSosScript(facts, input.language, degraded);
}
