import { model, models, Schema } from "mongoose";
import { GeoPointSchema } from "./shared.js";

const RiskUpdateSchema = new Schema(
  {
    timestamp: { type: Date, default: Date.now },
    aqi: Number,
    floodStatus: String,
    dengueStatus: String,
    weatherAlert: String,
    weatherDescription: String,
    temperature: Number,
    unrestAlert: String,
    summary: String,
  },
  { _id: false },
);
const RiskAlertSchema = new Schema(
  {
    factor: { type: String, required: true },
    previous: { type: String, required: true },
    current: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
const ReadinessWarningSchema = new Schema(
  {
    provider: String,
    event: String,
    severity: String,
    status: String,
    headline: String,
    area: String,
    expires: Date,
    distanceKm: Number,
    matchedAt: { type: [Number] },
    polygon: { type: [[Number]] },
  },
  { _id: false },
);
const ReadinessSchema = new Schema(
  {
    status: { type: String, enum: ["ready", "escalated"], default: "ready" },
    source: String,
    warnings: [ReadinessWarningSchema],
    nearestShelter: { name: String, point: { type: [Number] }, distanceKm: Number, source: String },
    offlineMap: {
      status: { type: String, enum: ["pending", "downloaded"], default: "pending" },
      zoom: Number,
      tileCount: Number,
      tiles: { type: [String] },
      downloadedAt: Date,
    },
    checkedAt: Date,
  },
  { _id: false },
);
const LowNetworkPackSchema = new Schema(
  {
    zoneId: { type: String, required: true },
    zoneName: String,
    status: { type: String, enum: ["pending", "downloaded"], default: "pending" },
    offlineMap: { zoom: Number, tileCount: Number, tiles: { type: [String] } },
    emergencyBundle: { servicesCount: Number, degraded: Boolean, personalContactsCount: Number },
    downloadedAt: Date,
  },
  { _id: false },
);
const TripSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    destination: { type: String, required: true },
    destinationPoint: { type: [Number], required: true },
    travelDates: { start: Date, end: Date },
    route: { geometry: Schema.Types.Mixed, distanceMeters: Number, durationSeconds: Number },
    currentRiskBrief: String,
    riskHistory: [RiskUpdateSchema],
    riskAlert: RiskAlertSchema,
    readiness: ReadinessSchema,
    lowNetworkPacks: [LowNetworkPackSchema],
    checkInDeadline: Date,
    shadowProfile: {
      lastLocation: GeoPointSchema,
      lastUpdated: Date,
      remainingRoute: Schema.Types.Mixed,
      nearestHospital: { name: String, location: GeoPointSchema },
      nearestFloodGauge: { name: String, location: GeoPointSchema },
    },
  },
  { timestamps: true },
);
TripSchema.index({ "shadowProfile.lastLocation": "2dsphere" });
export const Trip = models.Trip || model("Trip", TripSchema);
