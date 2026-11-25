const mongoose = require("mongoose");

// How many emails the server sent each day (UTC), for the daily email budget in
// services/notify.service.js (security review H-2). One small document per day; old days are
// deleted by MongoDB after a week (TTL index on createdAt).
const emailUsageSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true }, // "YYYY-MM-DD", UTC
  count: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
});

module.exports = mongoose.model("EmailUsage", emailUsageSchema);
