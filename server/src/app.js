const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  }),
);
app.use(express.json());
app.use(require("./middlewares/site.middleware").identifySite);

app.get("/", (req, res) => {
  res.json({ message: "BookFlow API is running" });
});

// For an uptime monitor (UptimeRobot, Better Stack...): 200 when the server AND the database
// answer, 503 when the database doesn't. Says nothing else about the server.
app.get("/api/health", async (req, res) => {
  const ping = mongoose.connection.readyState === 1 ? mongoose.connection.db.admin().ping() : Promise.reject();
  const timeout = new Promise((resolve, reject) => setTimeout(reject, 3000).unref());
  const up = await Promise.race([ping, timeout]).then(
    () => true,
    () => false,
  );
  res.set("Cache-Control", "no-store");
  res.status(up ? 200 : 503).json({ status: up ? "ok" : "down" });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenants", require("./routes/tenant.routes"));
app.use("/api/services", require("./routes/service.routes"));
app.use("/api/staff", require("./routes/staff.routes"));
app.use("/api/appointments", require("./routes/appointment.routes"));
app.use("/api/public", require("./routes/public.routes"));
app.use("/api/jobs", require("./routes/jobs.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

const { notFound, errorHandler } = require("./middlewares/error.middleware");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
