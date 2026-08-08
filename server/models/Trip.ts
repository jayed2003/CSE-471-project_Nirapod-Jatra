import { model, models, Schema } from "mongoose";
import { GeoPointSchema } from "./shared.js";

const RiskUpdateSchema = new Schema({ timestamp: { type: Date, default: Date.now }, aqi: Number, floodStatus: String, dengueStatus: String, weatherAlert: String, unrestAlert: String, summary: String }, { _id: false });
const TripSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, destination: { type: String, required: true }, travelDates: { start: Date, end: Date }, route: { geometry: Schema.Types.Mixed, distanceMeters: Number, durationSeconds: Number }, currentRiskBrief: String, riskHistory: [RiskUpdateSchema], checkInDeadline: Date, shadowProfile: { lastLocation: GeoPointSchema, lastUpdated: Date, remainingRoute: Schema.Types.Mixed, nearestHospital: { name: String, location: GeoPointSchema }, nearestFloodGauge: { name: String, location: GeoPointSchema } } }, { timestamps: true });
TripSchema.index({ "shadowProfile.lastLocation": "2dsphere" });
export const Trip = models.Trip || model("Trip", TripSchema);