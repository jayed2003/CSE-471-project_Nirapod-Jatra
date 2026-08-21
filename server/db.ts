import mongoose from "mongoose";

// Set DB_DEBUG=1 to print every MongoDB operation the app performs. Useful for demonstrating
// (or debugging) exactly which collections a given API request reads and writes.
if (process.env.DB_DEBUG === "1") {
  mongoose.set("debug", (collection: string, method: string, ...args: unknown[]) =>
    console.log(`[MongoDB] ${collection}.${method}`, JSON.stringify(args[0] ?? {})),
  );
}

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
