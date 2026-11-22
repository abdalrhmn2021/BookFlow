const mongoose = require("mongoose");

// Logged-out login tokens (security review): a copy of the token taken before logout (a stolen
// cookie, an old Bearer token) stops working at once, not only when it expires. Each entry is kept
// until that token's own expiry, then MongoDB deletes it by itself (TTL index), so the list stays small.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RevokedToken", revokedTokenSchema);
