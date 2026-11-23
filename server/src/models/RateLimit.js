const mongoose = require("mongoose");

// The rate limit counters (security review L-1), one document per counted key (an IP, an email,
// an account...), so they survive a restart or a new deploy and are shared by every copy of the
// server. _id is a SHA-256 of "<limiter>:<key>": no IPs or emails are stored as they are.
// MongoDB deletes a counter by itself once its window is over (TTL index).
// Written only by utils/rateLimitStore.js.
const rateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
);

rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RateLimit", rateLimitSchema);
