import { Schema } from "mongoose";

export const GeoPointSchema = new Schema({ type: { type: String, enum: ["Point"], default: "Point" }, coordinates: { type: [Number], required: true } }, { _id: false });