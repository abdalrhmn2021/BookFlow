require("dotenv").config();

// NODE_ENV missing = production settings (src/config/env.js). Said out loud, so local development
// isn't surprised by the HTTPS-only login cookie: set NODE_ENV=development in .env for that.
if (!process.env.NODE_ENV) {
  console.warn("NODE_ENV is not set - running with production security settings (NODE_ENV=development for local work)");
}

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET", "JWT_EXPIRES_IN"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET === "your_jwt_secret_here" || process.env.JWT_SECRET.length < 32) {
  console.error(
    "JWT_SECRET is too weak (placeholder or < 32 chars). Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  );
  process.exit(1);
}

const modeProblems = require("./src/config/mode").checkModeConfig();
if (modeProblems.length) {
  console.error(modeProblems.join("\n"));
  process.exit(1);
}

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  require("./src/services/reminder.service").startReminderJob();
  require("./src/services/maintenance.service").startMaintenanceJob();
});
