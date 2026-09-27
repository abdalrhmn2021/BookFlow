// 404 - no route matched. Must be registered AFTER all routes.
exports.notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Global error handler - Express recognizes it by the 4 arguments.
// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  // Malformed JSON body (thrown by express.json())
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body" });
  }
  // Mongoose schema validation
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: "Validation failed", errors });
  }
  // Invalid ObjectId, e.g. /api/users/123
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  // Unique index violation
  if (err.code === 11000) {
    // Compound indexes like { tenantId, name } report BOTH keys. tenantId is never the
    // user's mistake ("tenantId already exists" would be confusing) -> name the other field.
    const keys = Object.keys(err.keyValue || {});
    const field = keys.find((k) => k !== "tenantId") || keys[0] || "field";
    return res.status(409).json({ message: `${field} already exists` });
  }

  // Anything else is our bug: log it fully, tell the client nothing internal
  console.error("[error]", err);
  const status = err.statusCode || 500;
  res.status(status).json({
    message: status === 500 ? "Something went wrong" : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
