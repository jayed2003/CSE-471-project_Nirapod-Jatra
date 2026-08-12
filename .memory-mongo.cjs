const { MongoMemoryServer } = require("mongodb-memory-server");
(async () => {
  try {
    const mongod = await MongoMemoryServer.create({ instance: { port: 27017, dbName: "travel_safety" } });
    console.log("MEMORY_MONGO_READY:" + mongod.getUri());
  } catch (error) {
    console.error("MEMORY_MONGO_FAILED:" + error.message);
    process.exit(1);
  }
  setInterval(() => {}, 1 << 20);
})();