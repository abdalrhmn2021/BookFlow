require("dotenv").config();

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

if (process.env.NODE_ENV === "production" && !process.env.PROXY_SECRET) {
  console.warn(
    "PROXY_SECRET is not set: every visitor coming through the Vercel site shares one rate limit.\n" +
      "Set the same PROXY_SECRET on Render and on Vercel.",
  );
}

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
