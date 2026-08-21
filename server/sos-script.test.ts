import { describe, expect, it } from "vitest";
import { bearingBetween, composeSosScript, isRecognisableName, mapsUrlFor, shortAddress, speakCoordinateBn, toBanglaDigits, type SosScriptFacts } from "./sos-script.js";
import { SITUATION_SEED } from "./seed.js";

const DHAKA: [number, number] = [90.4074, 23.7806];

// The composer is pure, so it is tested against the seed row rather than a live database read.
const seedSituation = (type: string) => SITUATION_SEED.find((situation) => situation.type === type)!;

function factsFor(overrides: Partial<SosScriptFacts> = {}): SosScriptFacts {
	const situation = seedSituation("accident");
	return {
		callerName: "Ayesha Rahman",
		callerPhone: "01711223344",
		coordinates: { lat: DHAKA[1], lon: DHAKA[0], accuracyM: 12 },
		mapsUrl: mapsUrlFor(DHAKA[1], DHAKA[0]),
		address: { road: "Road 11", area: "Banani", city: "Dhaka", displayName: "Road 11, Banani, Dhaka, Bangladesh" },
		landmark: { name: "Banani Bidyaniketan", category: "school", point: [90.4060, 23.7795], distanceM: 180, bearingBn: "উত্তর-পূর্বে", bearingEn: "north-east" },
		alternatives: [],
		situation: { type: "accident", bn: situation.bn, en: situation.en, service: situation.service, serviceBn: situation.serviceBn },
		nearestHospital: { name: "Dhaka Medical College Hospital", distanceKm: 1.4 },
		followUpBn: situation.followUpBn,
		followUpEn: situation.followUpEn,
		...overrides,
	};
}

describe("toBanglaDigits", () => {
	it("converts ASCII digits and leaves other characters alone", () => {
		expect(toBanglaDigits("180 m")).toBe("১৮০ m");
		expect(toBanglaDigits(2026)).toBe("২০২৬");
	});
});

describe("speakCoordinateBn", () => {
	it("spells the coordinate out digit by digit so a bn-BD voice is intelligible", () => {
		expect(speakCoordinateBn(23.7806)).toBe("দুই তিন দশমিক সাত আট শূন্য ছয়");
	});

	it("marks a negative coordinate", () => {
		expect(speakCoordinateBn(-1.5)).toContain("ঋণাত্মক");
	});
});

describe("bearingBetween", () => {
	it("reports due north and due east", () => {
		expect(bearingBetween([90, 23], [90, 24]).bearingEn).toBe("north");
		expect(bearingBetween([90, 23], [91, 23]).bearingEn).toBe("east");
	});

	it("is directional — reversing the points flips the bearing", () => {
		expect(bearingBetween([90, 23], [90, 24]).bearingEn).toBe("north");
		expect(bearingBetween([90, 24], [90, 23]).bearingEn).toBe("south");
	});
});

describe("isRecognisableName", () => {
	it("accepts names carrying a distinctive token", () => {
		expect(isRecognisableName("Banani Bidyaniketan")).toBe(true);
		expect(isRecognisableName("Gulshan Central Mosque")).toBe(true);
		expect(isRecognisableName("Bashundhara City")).toBe(true);
	});

	it("rejects OSM names that only describe a facility", () => {
		// Real Overpass results near Dhaka — useless as a spoken reference point.
		expect(isRecognisableName("Prayer Place for Females")).toBe(false);
		expect(isRecognisableName("Health Building")).toBe(false);
		expect(isRecognisableName("Public Toilet")).toBe(false);
	});
});

describe("shortAddress", () => {
	it("joins road, area and city and drops duplicates", () => {
		expect(shortAddress({ road: "Road 11", area: "Banani", city: "Dhaka", displayName: "…" })).toBe("Road 11, Banani, Dhaka");
		expect(shortAddress({ area: "Dhaka", city: "Dhaka", displayName: "…" })).toBe("Dhaka");
	});

	it("returns null without an address", () => {
		expect(shortAddress(null)).toBeNull();
	});
});

describe("composeSosScript", () => {
	it("puts situation, address, landmark and spoken coordinates into the Bangla script", () => {
		const script = composeSosScript(factsFor(), "bn", false);
		expect(script.speech).toContain("সড়ক দুর্ঘটনা");
		expect(script.speech).toContain("Road 11, Banani, Dhaka");
		expect(script.speech).toContain("Banani Bidyaniketan");
		expect(script.speech).toContain("১৮০ মিটার উত্তর-পূর্বে");
		expect(script.speech).toContain(speakCoordinateBn(DHAKA[1]));
		expect(script.speech).toContain("অ্যাম্বুলেন্স");
	});

	it("keeps the Bangla SMS within two UCS-2 segments and includes the map link", () => {
		const script = composeSosScript(factsFor({ note: "দুইজন আহত, একজন অজ্ঞান" }), "bn", false);
		expect(script.sms.length).toBeLessThanOrEqual(140);
		expect(script.sms).toContain("maps");
	});

	it("still reports exact coordinates when the landmark lookup failed", () => {
		const script = composeSosScript(factsFor({ address: null, landmark: null }), "bn", true);
		expect(script.speech).toContain("কাছাকাছি কোনো পরিচিত চিহ্ন নিশ্চিত করা যায়নি");
		expect(script.speech).toContain(speakCoordinateBn(DHAKA[0]));
		expect(script.plain).toContain("23.78060, 90.40740");
		expect(script.plain).toContain("coordinates are still exact");
		expect(script.degraded).toBe(true);
	});

	it("emits both languages when asked", () => {
		const script = composeSosScript(factsFor(), "both", false);
		expect(script.speech).toContain("জরুরি সাহায্য দরকার");
		expect(script.speech).toContain("I need emergency help");
	});

	it("omits the phone line when the user has no number saved", () => {
		const script = composeSosScript(factsFor({ callerPhone: undefined }), "bn", false);
		expect(script.speech).not.toContain("ফোন নম্বর");
	});
});
