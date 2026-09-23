const express = require("express");
const cors = require("cors");

const app = express();

// Global Middlewares
app.use(cors());
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
// app.use("/api/appointments", require("./routes/appointment.routes"));

// Error handling - must come AFTER all routes
const { notFound, errorHandler } = require("./middlewares/error.middleware");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
