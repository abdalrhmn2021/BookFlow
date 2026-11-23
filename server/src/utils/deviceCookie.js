const crypto = require("crypto");
const { isDevOrTest } = require("../config/env");

// "Known device" (security review M-2).
//
// The login limit per EMAIL (rateLimit.middleware: 10 wrong passwords in 15 minutes, from any IP)
// stops someone guessing one account's password from many IPs - but it also let anyone lock a
// real person out of their own account, just by typing wrong passwords with their email.
//
// So a browser that already logged in to an account gets this cookie. With it, that account's
// per-email limits (login and "forgot password") don't apply to this browser: its owner can still
// sign in with the right password while someone else is hammering the account. The per-IP limits
// still apply, and the cookie never logs anyone in - the password (and the two-step code) are
// still checked as always.
//
// The cookie holds up to MAX_ENTRIES accounts (a shared family computer, an owner who is also a
// customer), each as "<emailId>.<expiry>.<signature>":
//   emailId    an HMAC of the email, so the cookie doesn't show which accounts used this browser
//   signature  an HMAC of the rest, so it can't be made up or edited
// Both are keyed with a key derived from JWT_SECRET: a new JWT_SECRET forgets every device.
const COOKIE_NAME = "bookflow_device";
const DAYS = 180;
const MAX_ENTRIES = 5;
const ID_LENGTH = 22; // characters of base64url (~128 bits)

const key = () => crypto.createHmac("sha256", process.env.JWT_SECRET).update("bookflow:known-device").digest();
const hmac = (text) => crypto.createHmac("sha256", key()).update(text).digest("base64url").slice(0, ID_LENGTH);
const emailId = (email) => hmac(`email:${String(email).trim().toLowerCase()}`);
const sign = (id, exp) => hmac(`entry:${id}.${exp}`);

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return "";
}

// The entries of this browser's cookie that are real (signed by us) and not expired.
function validEntries(req) {
  const now = Math.floor(Date.now() / 1000);
  return readCookie(req)
    .split("~")
    .slice(0, MAX_ENTRIES)
    .map((entry) => entry.split("."))
    .filter(([id, exp, sig]) => id && /^\d+$/.test(exp ?? "") && Number(exp) > now && safeEqual(sig, sign(id, exp)))
    .map(([id, exp]) => ({ id, exp }));
}

// Has this browser logged in to the account of this email before?
exports.isKnownDevice = (req, email) => {
  if (typeof email !== "string" || !email.trim()) return false;
  const id = emailId(email);
  return validEntries(req).some((entry) => entry.id === id);
};

// After a successful login (or a code that proved the inbox): remember this browser for this email.
exports.rememberDevice = (req, res, email) => {
  const id = emailId(email);
  const exp = String(Math.floor(Date.now() / 1000) + DAYS * 24 * 60 * 60);
  const others = validEntries(req).filter((entry) => entry.id !== id);
  const entries = [...others, { id, exp }].slice(-MAX_ENTRIES);
  res.cookie(COOKIE_NAME, entries.map((e) => `${e.id}.${e.exp}.${sign(e.id, e.exp)}`).join("~"), {
    httpOnly: true,
    secure: !isDevOrTest(),
    sameSite: "lax",
    path: "/api/auth", // only the login routes ever need it
    maxAge: DAYS * 24 * 60 * 60 * 1000,
  });
};

exports.DEVICE_COOKIE_NAME = COOKIE_NAME;
