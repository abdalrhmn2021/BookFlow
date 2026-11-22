const crypto = require("crypto");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { isEmailConfigured, sendVerificationEmail } = require("./notify.service");

// Email verification (security review M-01): a new account must prove it owns its email with a
// 6-digit code before it can log in. Without it anyone could sign up with someone else's email
// (and keep it from them), or fill the public directory with businesses nobody owns.
//
//   user.emailVerified === false  -> waiting for the code (only accounts made by the sign-up forms)
//   undefined / true              -> verified (older accounts, staff added by their owner, scripts)
//   tenant.pendingVerification    -> a business whose owner hasn't verified yet: kept inactive
//                                     (hidden, no bookings) until they do
//
// On when the server can send emails (Brevo) - without email there's no way to deliver a code -
// unless EMAIL_VERIFICATION=off. Same code rules as "forgot password": only an HMAC is stored,
// 5 tries per code, a try is spent before the compare.
const VERIFY_MINUTES = 30;
const VERIFY_MAX_ATTEMPTS = 5;
const VERIFY_CODE_REGEX = /^\d{6}$/;
const STALE_DAYS = 7;

const isVerificationOn = () =>
  isEmailConfigured() && (process.env.EMAIL_VERIFICATION || "").trim().toLowerCase() !== "off";

const needsVerification = (user) => user?.emailVerified === false && isVerificationOn();

const hashVerifyCode = (userId, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`verify:${userId}:${code}`).digest("hex");

// A new code replaces the old one. The email goes out in the background.
async function sendVerificationCode(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + VERIFY_MINUTES * 60 * 1000);
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, emailVerified: false },
    { $set: { verifyCodeHash: hashVerifyCode(user._id, code), verifyExpiresAt: expiresAt, verifyAttempts: 0 } },
  );
  if (modifiedCount !== 1) return;
  user.verifyExpiresAt = expiresAt;
  sendVerificationEmail({ email: user.email, name: user.name, code, minutes: VERIFY_MINUTES }).catch((err) =>
    console.error("[notify] verification email failed:", err.message),
  );
}

// The account proved it owns its email - with the sign-up code, or with a "forgot password" code
// (that one reached the same inbox). An owner's business goes live at the same moment.
async function markEmailVerified(user) {
  if (user.emailVerified !== false) return;
  await User.updateOne(
    { _id: user._id },
    { $set: { emailVerified: true }, $unset: { verifyCodeHash: 1, verifyExpiresAt: 1, verifyAttempts: 1 } },
  );
  user.emailVerified = true;
  if (user.role === "owner" && user.tenantId) {
    await Tenant.updateOne(
      { _id: user.tenantId, pendingVerification: true },
      { $set: { isActive: true }, $unset: { pendingVerification: 1 } },
    );
  }
}

// The account (of these candidates) this code belongs to, or null. Each candidate must have been
// loaded with +verifyCodeHash. Spends one try first, atomically, so parallel guesses can't sneak
// in extra tries.
async function findByVerificationCode(candidates, code) {
  if (!VERIFY_CODE_REGEX.test(code)) return null;
  for (const user of candidates) {
    if (!user.verifyCodeHash) continue;
    const { modifiedCount } = await User.updateOne(
      { _id: user._id, verifyCodeHash: user.verifyCodeHash, verifyAttempts: { $lt: VERIFY_MAX_ATTEMPTS } },
      { $inc: { verifyAttempts: 1 } },
    );
    if (modifiedCount !== 1) continue;
    const given = Buffer.from(hashVerifyCode(user._id, code));
    const expected = Buffer.from(user.verifyCodeHash);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return user;
  }
  return null;
}

// Deletes an unverified sign-up and, for an owner, the business waiting for them.
async function deleteUnverified(user) {
  if (user.role === "owner" && user.tenantId) {
    await Tenant.deleteOne({ _id: user.tenantId, pendingVerification: true });
  }
  await User.deleteOne({ _id: user._id, emailVerified: false });
}

// Before a new sign-up: an unverified account with this email whose code has run out (or a
// waiting business with this link whose owner's code has) doesn't block it - it's removed. So
// nobody can keep someone else's email or business link by signing up with it and never verifying.
// One whose code is still valid is left alone (its owner may be typing it right now).
async function removeExpiredUnverified({ email, scope = null, slug }) {
  const now = new Date();
  const expired = { $or: [{ verifyExpiresAt: { $lte: now } }, { verifyExpiresAt: { $exists: false } }] };

  if (email) {
    const users = await User.find({
      email: String(email).trim().toLowerCase(),
      scope,
      emailVerified: false,
      ...expired,
    });
    for (const user of users) await deleteUnverified(user);
  }

  if (slug) {
    const tenant = await Tenant.findOne({ slug: String(slug).trim().toLowerCase(), pendingVerification: true })
      .select("_id")
      .lean();
    if (tenant) {
      const owner = await User.findOne({ tenantId: tenant._id, role: "owner" }).select("+verifyExpiresAt");
      if (!owner) {
        await Tenant.deleteOne({ _id: tenant._id, pendingVerification: true });
      } else if (owner.emailVerified === false && !(owner.verifyExpiresAt > now)) {
        await deleteUnverified(owner);
      }
    }
  }
}

// Housekeeping (maintenance.service): sign-ups never verified within STALE_DAYS are removed.
async function removeStaleUnverified({ now = new Date() } = {}) {
  const before = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const users = await User.find({ emailVerified: false, createdAt: { $lt: before } }).select("role tenantId");
  for (const user of users) await deleteUnverified(user);

  // A waiting business left without an owner (shouldn't happen, but nothing would ever clean it).
  const orphans = await Tenant.find({ pendingVerification: true, createdAt: { $lt: before } })
    .select("_id")
    .lean();
  for (const t of orphans) {
    if (!(await User.exists({ tenantId: t._id }))) await Tenant.deleteOne({ _id: t._id, pendingVerification: true });
  }
  return users.length;
}

module.exports = {
  VERIFY_MINUTES,
  isVerificationOn,
  needsVerification,
  sendVerificationCode,
  markEmailVerified,
  findByVerificationCode,
  removeExpiredUnverified,
  removeStaleUnverified,
};
