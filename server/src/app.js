const express = require("express");
const cors = require("cors");

const app = express();

// Global Middlewares
// CORS: only OUR frontend may call this API from a browser.
// cors() with no options = "any website can call us" - fine for testing, not for real.
// CLIENT_URL can hold several origins separated by commas (local + deployed).
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = not a browser (Postman, REST Client, curl, server-to-server) -> allow
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false); // browser from another site -> no CORS headers -> browser blocks it
    },
  })
);
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.json({ message: "BookFlow API is running" });
});

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenants", require("./routes/tenant.routes"));
app.use("/api/services", require("./routes/service.routes"));
app.use("/api/staff", require("./routes/staff.routes"));
app.use("/api/appointments", require("./routes/appointment.routes"));
app.use("/api/public", require("./routes/public.routes")); // no login needed

// Error handling - must come AFTER all routes
const { notFound, errorHandler } = require("./middlewares/error.middleware");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
