const crypto = require("crypto");

const TOKEN_BYTES = 24;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{32}$/;

// Guests get the token once; only its SHA-256 hash is stored, so a DB leak exposes no links.
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function createManageToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashToken(token) };
}

const maskPhone = (phone) =>
  typeof phone === "string" && phone.length > 3 ? "*".repeat(phone.length - 3) + phone.slice(-3) : "***";

module.exports = { TOKEN_REGEX, hashToken, createManageToken, maskPhone };
