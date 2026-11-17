require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const { seed, reset } = require("../src/services/demo.service");

// npm run seed            -> create the demo business (if it isn't there yet)
// npm run seed -- --reset -> delete it and create it again
(async () => {
  await connectDB();
  try {
    if (process.argv.includes("--reset")) await reset({ log: console.log });
    await seed();
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
