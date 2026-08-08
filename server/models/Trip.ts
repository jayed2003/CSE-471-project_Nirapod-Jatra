import { model, models, Schema } from "mongoose";

const RiskUpdateSchema = new Schema({ timestamp: { type: Date, default: Date.now }, aqi: Number, floodStatus: String, dengueStatus: String, weatherAlert: String, unrestAlert: String, summary: String }, { _id: false });
const TripSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, destination: { type: String, required: true }, travelDates: { start: Date, end: Date }, route: { geometry: Schema.Types.Mixed, distanceMeters: Number, durationSeconds: Number }, currentRiskBrief: String, riskHistory: [RiskUpdateSchema], checkInDeadline: Date }, { timestamps: true });
export const Trip = models.Trip || model("Trip", TripSchema);