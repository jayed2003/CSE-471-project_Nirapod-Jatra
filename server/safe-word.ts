import { z } from "zod";

// Kept deliberately small and duplicated in src/lib/safe-word.ts: the matcher runs in the
// browser and the validator runs here, and the two tsconfigs do not share a module graph.
export function normalizeBangla(value: string) {
	return value
		.normalize("NFC")
		.replace(/\p{Cf}/gu, "")
		.replace(/[।,.!?'"()[\]{}\-–—_/\\]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

// A safe-word must not be something a person says while merely upset, or it will fire during
// an ordinary argument. These are exactly the words users reach for first, so reject them.
const COMMON_PHRASES = new Set([
	"সাহায্য", "বাঁচাও", "help", "সেভ", "save", "আম্মু", "আব্বু", "মা", "বাবা", "আল্লাহ",
	"ভয়", "ভয় লাগছে", "কষ্ট", "না", "থামো", "ছাড়ো", "যাও", "এসো", "শোনো", "দেখো",
	"emergency", "জরুরি", "পুলিশ", "police", "sos", "এস ও এস",
]);

export const SAFE_WORD_SENSITIVITIES = ["low", "normal", "high"] as const;
export type SafeWordSensitivity = (typeof SAFE_WORD_SENSITIVITIES)[number];

export function describeSafeWordProblem(phrase: string): string | null {
	const normalized = normalizeBangla(phrase);
	if (normalized.replace(/\s+/g, "").length < 5) return "Safe-word is too short — it will trigger by accident. Use at least five letters.";
	if (COMMON_PHRASES.has(normalized)) return "That phrase is too common in ordinary speech. Pick something you would never say by chance.";
	if (normalized.split(" ").some((token) => COMMON_PHRASES.has(token)) && normalized.split(" ").length < 2) return "That phrase is too common in ordinary speech. Pick something you would never say by chance.";
	return null;
}

export const safeWordSchema = z.object({
	enabled: z.boolean().default(false),
	phrase: z.string().trim().min(1).max(40),
	romanized: z.string().trim().max(60).optional(),
	sensitivity: z.enum(SAFE_WORD_SENSITIVITIES).default("normal"),
}).superRefine((value, context) => {
	const problem = describeSafeWordProblem(value.phrase);
	if (problem) context.addIssue({ code: "custom", path: ["phrase"], message: problem });
});
