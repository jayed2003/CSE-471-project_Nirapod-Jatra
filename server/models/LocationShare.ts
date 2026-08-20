import { model, models, Schema } from "mongoose";
import { GeoPointSchema } from "./shared.js";

const LocationShareSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true },
    requesterName: { type: String, required: true },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    location: GeoPointSchema,
    accuracy: Number,
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
LocationShareSchema.index({ location: "2dsphere" });
export const LocationShare = models.LocationShare || model("LocationShare", LocationShareSchema);
