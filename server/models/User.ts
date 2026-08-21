import { model, models, Schema } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    plan: { type: String, enum: ["basic", "premium"], default: "basic" },
    locationMonitoringEnabled: { type: Boolean, default: false },
    safeWord: {
      enabled: { type: Boolean, default: false },
      phrase: { type: String, trim: true },
      romanized: { type: String, trim: true },
      sensitivity: { type: String, enum: ["low", "normal", "high"], default: "normal" },
      updatedAt: Date,
    },
    pushSubscriptions: [{ endpoint: String, keys: { p256dh: String, auth: String } }],
    trustedDevices: [
      {
        name: { type: String, required: true },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
export const User = models.User || model("User", UserSchema);
