import mongoose from "mongoose";
export async function connectDatabase() {
  const connectionString = process.env.MONGODB_URI;
  if (!connectionString) throw new Error("MONGODB_URI is required");
  const databaseUri =
    connectionString.includes("mongodb.net/") && !connectionString.match(/mongodb\.net\/[^?]+/)
      ? `${connectionString.replace("?", "/travel_safety?")}`
      : connectionString;
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  return mongoose.connect(databaseUri);
}
