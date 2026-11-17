// The API for the end-to-end tests (client/e2e, `npm run test:e2e` in client/). Playwright starts it.
//
// It runs on a throwaway in-memory MongoDB with only the demo business (npm run seed's data),
// and it does NOT read server/.env: no real database, no Brevo, no WhatsApp - nothing leaves
// the machine. Stopped with Ctrl+C / when the tests end; the database goes with it.
//
// MONGO_URI_TEST (a replica set) is used instead of the in-memory one if set, as in npm test.

if (process.env.NODE_ENV === "production") {
  console.error("e2e-server is for tests only - refusing to run with NODE_ENV=production");
  process.exit(1);
}

const crypto = require("crypto");

// Only what the tests need. Everything that could reach the outside world is removed.
for (const key of [
  "MONGO_URI",
  "BREVO_API_KEY",
  "MAIL_FROM",
  "ALERT_EMAIL",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "TURNSTILE_SECRET_KEY",
  "SHARED_SERVER",
  "SINGLE_BUSINESS_SLUG",
  "SITE_PROXY_SECRET",
  "JOBS_SECRET",
  "DEMO_RESET_HOURS",
]) {
  delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  JWT_EXPIRES_IN: "1h",
  PORT: process.env.PORT || "5055",
  CLIENT_URL: process.env.CLIENT_URL || "http://127.0.0.1:3055",
});

const mongoose = require("mongoose");

let replSet;

async function main() {
  let uri = process.env.MONGO_URI_TEST?.trim();
  if (!uri) {
    const { MongoMemoryReplSet } = require("mongodb-memory-server");
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    uri = replSet.getUri();
  }
  // Transactions need a replica set: bookings use them.
  await mongoose.connect(uri, { dbName: "bookflow_e2e" });
  if (mongoose.connection.name !== "bookflow_e2e") throw new Error("connected to the wrong database");
  await mongoose.connection.db.dropDatabase();

  const app = require("../src/app");
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await require("../src/services/demo.service").seed({ log: () => {} });

  app.listen(Number(process.env.PORT), "127.0.0.1", () => {
    console.log(`[e2e] API with the demo data on http://127.0.0.1:${process.env.PORT}`);
  });
}

async function stop(code = 0) {
  await mongoose.disconnect().catch(() => {});
  if (replSet) await replSet.stop().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

main().catch(async (err) => {
  console.error("[e2e] could not start:", err);
  await stop(1);
});
