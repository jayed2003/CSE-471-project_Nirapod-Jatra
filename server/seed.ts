import { connectDatabase } from "./db.js";
import { Situation } from "./models/Situation.js";
import { SafeWordSuggestion } from "./models/SafeWordSuggestion.js";
import type { SituationRecord } from "./sos-script.js";

/**
 * Initial contents of the `situations` collection. This is SEED data, not runtime configuration:
 * once it is in MongoDB the application reads it from there on every request, and these values
 * are never consulted again unless the database is empty.
 */
export const SITUATION_SEED: Array<SituationRecord & { order: number }> = [
	{ order: 1, type: "medical", bn: "চিকিৎসা জরুরি অবস্থা", en: "medical emergency", service: "ambulance", serviceBn: "অ্যাম্বুলেন্স", followUpBn: ["রোগীর বয়স কত?", "রোগী কি জ্ঞান হারিয়েছে?", "শ্বাস নিতে পারছে কি?"], followUpEn: ["How old is the patient?", "Is the patient conscious?", "Are they breathing?"] },
	{ order: 2, type: "accident", bn: "সড়ক দুর্ঘটনা", en: "road accident", service: "ambulance", serviceBn: "অ্যাম্বুলেন্স", followUpBn: ["কতজন আহত?", "কেউ কি গাড়িতে আটকে আছে?", "রাস্তা কি বন্ধ হয়ে গেছে?"], followUpEn: ["How many people are injured?", "Is anyone trapped in a vehicle?", "Is the road blocked?"] },
	{ order: 3, type: "fire", bn: "আগুন লেগেছে", en: "fire", service: "fire", serviceBn: "ফায়ার সার্ভিস", followUpBn: ["আগুন কোন তলায়?", "ভেতরে কেউ আটকে আছে?", "গ্যাস সিলিন্ডার আছে কি?"], followUpEn: ["Which floor is the fire on?", "Is anyone trapped inside?", "Are there gas cylinders nearby?"] },
	{ order: 4, type: "flood", bn: "বন্যার পানিতে আটকে আছি", en: "trapped by floodwater", service: "fire", serviceBn: "ফায়ার সার্ভিস", followUpBn: ["পানির উচ্চতা কত?", "সাথে কতজন আছেন?", "শিশু বা বয়স্ক কেউ আছে?"], followUpEn: ["How deep is the water?", "How many people are with you?", "Any children or elderly?"] },
	{ order: 5, type: "crime", bn: "আমি আক্রমণের শিকার হয়েছি", en: "assault or crime in progress", service: "police", serviceBn: "পুলিশ", followUpBn: ["আক্রমণকারী কি এখনো সেখানে আছে?", "কেউ কি আহত?", "অস্ত্র আছে কি?"], followUpEn: ["Is the attacker still there?", "Is anyone injured?", "Are there weapons?"] },
	{ order: 6, type: "harassment", bn: "আমি হয়রানির শিকার হচ্ছি এবং নিরাপদ বোধ করছি না", en: "harassment, I do not feel safe", service: "police", serviceBn: "পুলিশ", followUpBn: ["আপনি কি এখন নিরাপদ জায়গায় আছেন?", "অভিযুক্তকে চেনেন?", "আশেপাশে লোকজন আছে?"], followUpEn: ["Are you somewhere safe right now?", "Do you know the person?", "Are there other people around?"] },
	{ order: 7, type: "stranded", bn: "আমি আটকে পড়েছি, নিরাপদ জায়গায় যেতে পারছি না", en: "stranded and unable to reach safety", service: "any", serviceBn: "জরুরি সেবা", followUpBn: ["সাথে কতজন আছেন?", "খাবার ও পানি আছে কি?", "ফোনের চার্জ কতটুকু?"], followUpEn: ["How many people are with you?", "Do you have food and water?", "How much phone battery is left?"] },
	{ order: 8, type: "unknown", bn: "জরুরি অবস্থা", en: "emergency", service: "any", serviceBn: "জরুরি সেবা", followUpBn: ["ঠিক কী ঘটেছে?", "কেউ কি আহত?", "আপনি কি নিরাপদ?"], followUpEn: ["What exactly happened?", "Is anyone injured?", "Are you safe?"] },
];

export const SAFE_WORD_SUGGESTION_SEED = [
	{ order: 1, phrase: "নীল আকাশ", romanized: "nil akash" },
	{ order: 2, phrase: "সাদা পাথর", romanized: "shada pathor" },
	{ order: 3, phrase: "লাল ঘুড়ি", romanized: "lal ghuri" },
	{ order: 4, phrase: "সোনালি নদী", romanized: "shonali nodi" },
];

/**
 * Idempotent seed. `upsert` means running it repeatedly is safe — existing documents are updated
 * in place rather than duplicated, so it can run on every server boot.
 */
export async function seedReferenceData() {
	const situationResults = await Promise.all(SITUATION_SEED.map((situation) =>
		Situation.updateOne({ type: situation.type }, { $setOnInsert: situation }, { upsert: true })));
	const suggestionResults = await Promise.all(SAFE_WORD_SUGGESTION_SEED.map((suggestion) =>
		SafeWordSuggestion.updateOne({ phrase: suggestion.phrase }, { $setOnInsert: suggestion }, { upsert: true })));
	const inserted = (results: Array<{ upsertedCount?: number }>) => results.reduce((total, result) => total + (result.upsertedCount ?? 0), 0);
	return { situationsInserted: inserted(situationResults), suggestionsInserted: inserted(suggestionResults) };
}

// Allow `npm run seed` to populate a fresh database without starting the API. The path check is
// specific so importing this module from the server or a test never triggers a run.
if (/[\\/]seed\.ts$/.test(process.argv[1] ?? "")) {
	void (async () => {
		const { config } = await import("dotenv");
		config();
		config({ path: ".env.local", override: false });
		await connectDatabase();
		const result = await seedReferenceData();
		console.log(`Seeded reference data: ${result.situationsInserted} situation(s), ${result.suggestionsInserted} safe-word suggestion(s) inserted.`);
		console.log("Collections created/updated: situations, safewordsuggestions");
		process.exit(0);
	})();
}
