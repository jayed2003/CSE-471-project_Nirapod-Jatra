import { model, models, Schema } from "mongoose";
import { GeoPointSchema } from "./shared.js";

const SosEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", index: true },
    location: GeoPointSchema,
    accuracyM: Number,
    message: { type: String, maxlength: 500 },
    situationType: {
      type: String,
      enum: ["medical", "accident", "fire", "flood", "crime", "harassment", "stranded", "unknown"],
      default: "unknown",
    },
    trigger: {
      type: String,
      enum: ["button", "voice", "missed-checkin", "shake"],
      default: "button",
    },
    voice: { heardText: { type: String, maxlength: 200 }, confidence: Number },
    address: String,
    landmark: { name: String, distanceM: Number, bearing: String },
    script: { speech: String, sms: String, plain: String, degraded: Boolean },
    deliveries: [
      {
        channel: { type: String, enum: ["email", "sms", "realtime"] },
        target: String,
        status: { type: String, enum: ["sent", "failed", "skipped"] },
        at: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open" },
  },
  { timestamps: true },
);
SosEventSchema.index({ location: "2dsphere" });
export const SosEvent = models.SosEvent || model("SosEvent", SosEventSchema);
