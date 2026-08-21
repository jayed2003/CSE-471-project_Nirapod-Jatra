import { model, models, Schema } from "mongoose";

// Emergency situation catalogue. Lives in MongoDB (not in source) so the wording read to a 999
// operator can be corrected or extended without a redeploy. Seeded by server/seed.ts.
const SituationSchema = new Schema({
	type: { type: String, required: true, unique: true, index: true },
	bn: { type: String, required: true },
	en: { type: String, required: true },
	service: { type: String, enum: ["ambulance", "police", "fire", "any"], required: true },
	serviceBn: { type: String, required: true },
	followUpBn: { type: [String], default: [] },
	followUpEn: { type: [String], default: [] },
	order: { type: Number, default: 0 },
}, { timestamps: true });

export const Situation = models.Situation || model("Situation", SituationSchema);
