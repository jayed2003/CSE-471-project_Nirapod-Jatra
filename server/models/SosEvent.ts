import { model, models, Schema } from "mongoose";
import { GeoPointSchema } from "./shared.js";

const SosEventSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, tripId: { type: Schema.Types.ObjectId, ref: "Trip", index: true }, location: GeoPointSchema, message: { type: String, maxlength: 500 }, status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open" } }, { timestamps: true });
SosEventSchema.index({ location: "2dsphere" });
export const SosEvent = models.SosEvent || model("SosEvent", SosEventSchema);