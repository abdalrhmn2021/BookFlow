const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

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

app.get("/", (req, res) => {
  res.json({ message: "BookFlow API is running" });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenants", require("./routes/tenant.routes"));
app.use("/api/services", require("./routes/service.routes"));
app.use("/api/staff", require("./routes/staff.routes"));
app.use("/api/appointments", require("./routes/appointment.routes"));
app.use("/api/public", require("./routes/public.routes"));

const { notFound, errorHandler } = require("./middlewares/error.middleware");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
