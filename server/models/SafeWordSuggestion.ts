import { model, models, Schema } from "mongoose";

// Suggested Bangla safe-word phrases offered during setup. Stored in MongoDB so the list can be
// tuned (or localised further) without touching application code. Seeded by server/seed.ts.
const SafeWordSuggestionSchema = new Schema({
	phrase: { type: String, required: true, unique: true, trim: true },
	romanized: { type: String, trim: true },
	order: { type: Number, default: 0 },
}, { timestamps: true });

export const SafeWordSuggestion = models.SafeWordSuggestion || model("SafeWordSuggestion", SafeWordSuggestionSchema);
