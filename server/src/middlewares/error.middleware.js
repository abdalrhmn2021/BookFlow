const { reportError, whereOf } = require("../services/alert.service");

exports.notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Express recognises an error handler by its 4 arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body" });
  }
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: "Validation failed", errors });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    const keys = Object.keys(err.keyValue || {});
    const field = keys.find((k) => k !== "tenantId") || keys[0] || "field";
    return res.status(409).json({ message: `${field} already exists` });
  }

  if (err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Name, message and stack only - not the whole error object, which can carry request data.
  console.error(`[error] ${whereOf(req)}`, err?.stack || `${err?.name}: ${err?.message}`);
  const status = err.statusCode || 500;
  // An email to ALERT_EMAIL (if set) - in the background, the answer doesn't wait for it.
  if (status >= 500) reportError(err, whereOf(req));
  res.status(status).json({
    message: status === 500 ? "Something went wrong" : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
