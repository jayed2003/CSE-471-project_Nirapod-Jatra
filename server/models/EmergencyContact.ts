import { model, models, Schema } from "mongoose";

const EmergencyContactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    priority: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);
export const EmergencyContact =
  models.EmergencyContact || model("EmergencyContact", EmergencyContactSchema);
