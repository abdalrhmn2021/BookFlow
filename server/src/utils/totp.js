// Two-step login codes (TOTP, RFC 6238): the 6 digits that apps like Google Authenticator,
// Microsoft Authenticator or Authy show, a new one every 30 seconds.
// Turned on per account with `npm run two-factor` (scripts/two-factor.js) - meant for the
// superadmin account, which can see every business.
const crypto = require("crypto");

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A new random secret: 20 bytes (160 bits), as the authenticator apps expect it (base32).
const generateSecret = () => base32Encode(crypto.randomBytes(20));

// The code for one 30-second step (HOTP with the step number as the counter).
function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(number).padStart(DIGITS, "0");
}

const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

// Checks a code against the current step and one step either side (phone clocks drift a little).
// Returns the matching step, or null. The caller stores the step and refuses it (and older ones)
// next time, so a code someone saw over your shoulder can't be used a second time.
function verifyCode(secret, code, { now = Date.now(), lastStep = -1 } = {}) {
  const given = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate <= lastStep) continue;
    const expected = codeAt(secret, candidate);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return candidate;
  }
  return null;
}

// The link the authenticator app understands (also what a QR code would contain).
const otpauthUrl = ({ secret, account, issuer = "BookFlow" }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}` +
  `&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

module.exports = { generateSecret, verifyCode, codeAt, currentStep, otpauthUrl, base32Encode, base32Decode };
