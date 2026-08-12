import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

export const briefSchema = z.object({ destination: z.string().min(2).max(200), distanceKm: z.number().nonnegative().optional(), durationMin: z.number().nonnegative().optional(), temperature: z.number().optional(), weather: z.string().max(80).optional(), aqi: z.number().int().min(1).max(5).optional(), aqiLabel: z.string().max(30).optional() });
export type BriefContext = z.infer<typeof briefSchema>;

function fallbackBrief(context: BriefContext) {
	const destination = context.destination.split(",")[0];
	const journey = context.durationMin ? `Allow about ${context.durationMin} minutes for the journey to ${destination}.` : `Confirm your departure time before travelling to ${destination}.`;
	const conditions = context.weather ? `Pack for ${context.weather.toLowerCase()} conditions${context.temperature !== undefined ? ` near ${Math.round(context.temperature)} C` : ""}.` : "Check local conditions again before departure.";
	const air = context.aqiLabel ? `Air quality is currently listed as ${context.aqiLabel}; carry water and take comfort breaks as needed.` : "Keep your phone charged and share your route with a trusted contact.";
	return `- ${journey}\n- ${conditions}\n- ${air}`;
}

export async function buildTravelBrief(context: BriefContext): Promise<{ brief: string; source: "gemini" | "fallback" }> {
	const key = process.env.GEMINI_API_KEY;
	if (!key) return { brief: fallbackBrief(context), source: "fallback" };
	try {
		const client = new GoogleGenAI({ apiKey: key });
		const prompt = `You are Nirapod Jatra, a concise travel preparation assistant. Write a short, calm, practical destination brief for ${context.destination}. Context: route distance ${context.distanceKm ?? "unavailable"} km; estimated duration ${context.durationMin ?? "unavailable"} min; weather ${context.weather ?? "unavailable"}; temperature ${context.temperature ?? "unavailable"} C; air quality ${context.aqiLabel ?? "unavailable"} (level ${context.aqi ?? "unavailable"}). Return exactly three separate lines. Each line must start with "- " and contain at most 20 words. Cover practical preparation, arrival timing, and weather/air comfort where context supports it. Do not calculate, classify, or override safety risk. Do not provide emergency, medical, legal, or political advice. Do not claim live information beyond the supplied context.`;
		const response = await client.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt, config: { temperature: 0.3, maxOutputTokens: 300, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } });
		const text = response.text?.trim();
		if (!text) throw new Error("Empty response");
		return { brief: text, source: "gemini" };
	} catch { return { brief: fallbackBrief(context), source: "fallback" }; }
}