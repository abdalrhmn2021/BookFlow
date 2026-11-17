const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { SINGLE_BUSINESS_SLUG, SHARED_SERVER } = require("../config/mode");
const { siteAllows, customerScope, OTHER_BUSINESS_MESSAGE } = require("../middlewares/site.middleware");
const { isDemoEmail } = require("../config/demo");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");
const { verifyCode } = require("../utils/totp");
const { createBusinessWithOwner } = require("../services/business.service");
const { isEmailConfigured, sendPasswordResetEmail } = require("../services/notify.service");
const Appointment = require("../models/Appointment");
const CustomerTenant = require("../models/CustomerTenant");
const { ACTIVE_STATUSES } = require("../services/booking.service");
const { REMOVED_NAME } = require("../services/maintenance.service");

const ACCOUNT_DELETED_REASON = "The customer deleted their account";

// Credentials must be real strings: an object like { "$gt": "" } would become a
// MongoDB operator inside findOne (NoSQL injection).
const isText = (value) => typeof value === "string" && value.length > 0;

// Accounts this email may sign in to here, this site's own first.
async function accountsFor(req, email, extra = {}) {
  const scope = await customerScope(req);
  const scopes = scope ? [scope, null] : [null];
  const users = await User.find({ email: String(email).trim().toLowerCase(), scope: { $in: scopes }, ...extra }).select(
    "+password +twoFactorSecret +twoFactorLastStep",
  );
  return users.sort((a, b) => Number(Boolean(b.scope)) - Number(Boolean(a.scope)));
}

async function findAccount(req, email, password) {
  for (const user of await accountsFor(req, email)) {
    if (await user.comparePassword(password)) return user;
  }
  return null;
}

// The browser gets its login in the httpOnly cookie only. The token is also in the JSON answer
// in development, for server/api-tests.http (VS Code REST Client) - never in production, where
// a copy readable by page scripts would undo the point of the httpOnly cookie.
// Two-step login: with it on, the right password alone is not enough - the 6-digit code from the
// authenticator app must come too. Each code works once (the step is saved atomically, so two
// requests racing with the same code can't both win).
const TWO_FACTOR_REQUIRED = "Two-factor code required";
const TWO_FACTOR_INVALID = "Invalid two-factor code";

async function checkTwoFactor(user, code) {
  if (!user.twoFactorSecret) return null; // off for this account
  if (code === undefined || code === null || code === "") return TWO_FACTOR_REQUIRED;
  const step = verifyCode(user.twoFactorSecret, code, { lastStep: user.twoFactorLastStep ?? -1 });
  if (step === null) return TWO_FACTOR_INVALID;
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, $or: [{ twoFactorLastStep: { $lt: step } }, { twoFactorLastStep: { $exists: false } }] },
    { $set: { twoFactorLastStep: step } },
  );
  return modifiedCount === 1 ? null : TWO_FACTOR_INVALID;
}

const devToken = (token) => (process.env.NODE_ENV === "production" ? {} : { token });

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    algorithm: "HS256", // the only one protect() accepts
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!isText(name) || !isText(email) || !isText(password)) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    // On a shared server the account belongs to this site's business only - so it can only be
    // made on that site. Straight on the server (no site) there is no business to give it to.
    const scope = await customerScope(req);
    if (SHARED_SERVER && !scope) {
      return res.status(403).json({ message: "Please sign up on the business's own booking site" });
    }
    const existingUser = await User.findOne({ email: email.trim().toLowerCase(), scope });
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: "customer",
      scope,
    });

    const token = generateToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      ...devToken(token),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: "Validation failed", errors });
    }
    console.error("[auth] error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (!isText(email) || !isText(password)) {
      return res.status(400).json({ message: "email and password are required" });
    }

    // The same email can have two accounts on a shared server: a customer account of THIS
    // site's business, and a normal one (owner, staff, admin, or an older customer account).
    // The site's own account is tried first; the password decides which one it is.
    const user = await findAccount(req, email, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    if (user.role === "owner" || user.role === "staff") {
      const tenant = await Tenant.findById(user.tenantId);
      if (!tenant || !tenant.isActive) {
        return res.status(403).json({ message: "This business account is disabled" });
      }
      // The owner of salon A can't sign in on salon B's site (their dashboard lives on their own site).
      if (!siteAllows(req, tenant.slug)) {
        return res.status(403).json({ message: OTHER_BUSINESS_MESSAGE });
      }
    }

    // Last, after every other check: a code is only asked for once the password is right.
    // 401 on purpose, so a wrong code counts against the login limits like a wrong password.
    const twoFactorProblem = await checkTwoFactor(user, code);
    if (twoFactorProblem) {
      return res.status(401).json({ message: twoFactorProblem, twoFactorRequired: true });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      ...devToken(token),
    });
  } catch (error) {
    console.error("[auth] error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

exports.registerBusiness = async (req, res) => {
  const { businessName, slug, ownerName, email, password, phone } = req.body;

  if (![businessName, slug, ownerName, email, password].every(isText)) {
    return res.status(400).json({
      message: "businessName, slug, ownerName, email and password are required",
    });
  }

  // Shared server: clients are added only with `npm run setup-client`, never from the web.
  // Dedicated server: only its own business, once (the slug is unique).
  if (SHARED_SERVER || (SINGLE_BUSINESS_SLUG && String(slug).trim().toLowerCase() !== SINGLE_BUSINESS_SLUG)) {
    return res.status(403).json({ message: "Business registration is disabled" });
  }

  const { tenant, owner } = await createBusinessWithOwner({ businessName, slug, ownerName, email, password, phone });

  const token = generateToken(owner);
  setAuthCookie(res, token);

  res.status(201).json({
    tenant: {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
    },
    user: {
      id: owner._id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
      tenantId: tenant._id,
    },
    ...devToken(token),
  });
};

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).populate("tenantId", "name slug");

  const business = user.tenantId
    ? {
        id: user.tenantId._id,
        name: user.tenantId.name,
        slug: user.tenantId.slug,
      }
    : null;

  res.status(200).json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      business,
    },
  });
};

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ message: "Logged out" });
};

const DEMO_PASSWORD_LOCKED = "Demo accounts can't change their password";

// DELETE /api/auth/me { password } - a customer deletes their own account.
// Upcoming bookings are cancelled (the business sees why), and every booking keeps its time,
// service and price but loses the link to the person (name shown as "—"), so the business's
// history and income numbers stay right while nothing personal is left. Owners, staff and the
// admin can't delete themselves here: their account is the business's dashboard.
exports.deleteMyAccount = async (req, res) => {
  const { password } = req.body || {};
  if (!isText(password)) return res.status(400).json({ message: "Please enter your password to confirm" });

  const user = await User.findById(req.user.id).select("+password");
  if (user.role !== "customer") {
    return res.status(403).json({ message: "Only customer accounts can be deleted here" });
  }
  if (isDemoEmail(user.email)) return res.status(403).json({ message: "Demo accounts can't be deleted" });
  if (!(await user.comparePassword(password))) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }

  const now = new Date();
  await Appointment.updateMany(
    { customerId: user._id, status: { $in: ACTIVE_STATUSES }, startTime: { $gt: now } },
    { $set: { status: "cancelled", cancellation: { reason: ACCOUNT_DELETED_REASON, cancelledAt: now } } },
  );
  await Appointment.updateMany(
    { customerId: user._id },
    {
      $set: { guest: { name: REMOVED_NAME }, personalDataRemovedAt: now },
      $unset: { customerId: 1, notes: 1 },
    },
  );
  await CustomerTenant.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });

  clearAuthCookie(res);
  res.status(200).json({ message: "Your account was deleted" });
};

// Logged in: current password + new one. Other devices are signed out (passwordChangedAt),
// this one gets a fresh cookie so it stays logged in.
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!isText(currentPassword) || !isText(newPassword)) {
    return res.status(400).json({ message: "currentPassword and newPassword are required" });
  }

  const user = await User.findById(req.user.id).select("+password");
  if (isDemoEmail(user.email)) return res.status(403).json({ message: DEMO_PASSWORD_LOCKED });

  if (!(await user.comparePassword(currentPassword))) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "The new password must be different from the current one" });
  }

  user.password = newPassword;
  // A reset code still waiting in the user's inbox stops working too.
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  user.resetAttempts = undefined;
  await user.save(); // validates (8+ chars), hashes, sets passwordChangedAt

  setAuthCookie(res, generateToken(user));
  res.status(200).json({ message: "Password changed" });
};

// ---- Forgot password: a 6-digit code by email ----
// 1. POST /forgot-password { email }                 -> a code is emailed (valid 15 minutes)
// 2. POST /reset-password  { email, code, password } -> new password, and the user is logged in
//
// A 6-digit code has only a million values, so guessing is what we guard against:
//  - each code allows 5 tries, then it is dead (a new one must be requested);
//  - a try is "spent" BEFORE the code is compared, atomically, so parallel requests can't sneak
//    in extra tries;
//  - new codes are limited per email (rateLimit.middleware: forgotEmailLimiter), so the
//    attacker can't just ask for fresh codes all day (that would also flood the inbox).
//  => at most about 15 guesses an hour against a million values.
// Only an HMAC of the code is stored (keyed with JWT_SECRET and bound to the account), so a
// copy of the database alone isn't enough to read the codes back.
const RESET_CODE_REGEX = /^\d{6}$/;
const RESET_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;
const hashResetCode = (userId, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`reset:${userId}:${code}`).digest("hex");
const RESET_SENT = "If this email has an account, a code is on its way";
const RESET_INVALID = "This code is wrong or has expired";

// Same answer whether or not the email has an account, so the form can't be used to find out
// who is registered. The email goes out in the background (no timing difference either).
// Customers can sign in on every site; owners and staff only on their own business's site.
async function canSignInHere(req, user) {
  if (!req.siteLocked || (user.role !== "owner" && user.role !== "staff")) return true;
  const tenant = await Tenant.findById(user.tenantId).select("slug").lean();
  return Boolean(tenant) && siteAllows(req, tenant.slug);
}

exports.forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!isText(email)) return res.status(400).json({ message: "email is required" });

  if (!isEmailConfigured()) {
    return res.status(503).json({ message: "Password reset by email isn't set up here, please contact the business" });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = isDemoEmail(cleanEmail) ? null : (await accountsFor(req, cleanEmail, { isActive: true }))[0];

  // On a one-business site, don't send salon A's owner a code for salon B's site
  // (same answer either way, so nobody learns which emails exist).
  if (user && (await canSignInHere(req, user))) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetTokenHash: hashResetCode(user._id, code),
          resetTokenExpiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
          resetAttempts: 0,
        },
      },
    );
    sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      code,
      minutes: RESET_MINUTES,
    }).catch((err) => console.error("[notify] password reset email failed:", err.message));
  }

  res.status(200).json({ message: RESET_SENT });
};

// The code from the email + a new password: the password is changed and the user is logged in.
exports.resetPassword = async (req, res) => {
  const { email, code, password } = req.body || {};
  if (!isText(email) || !isText(code) || !isText(password)) {
    return res.status(400).json({ message: "email, code and password are required" });
  }

  // Checked before a try is spent, so a too-short password doesn't use up the code.
  if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

  const invalid = () => res.status(400).json({ message: RESET_INVALID });
  const cleanCode = code.replace(/\s/g, "");
  if (!RESET_CODE_REGEX.test(cleanCode)) return invalid();

  // The account of this email (on this site) that has a code waiting. Normally one.
  const candidates = await User.find({
    email: email.trim().toLowerCase(),
    scope: { $in: [await customerScope(req), null] },
    isActive: true,
    resetTokenExpiresAt: { $gt: new Date() },
  }).select("+resetTokenHash +resetTokenExpiresAt +resetAttempts +twoFactorSecret");

  for (const user of candidates) {
    // Spend one try first (atomically): no tries left = the code is dead.
    const { modifiedCount } = await User.updateOne(
      { _id: user._id, resetTokenHash: user.resetTokenHash, resetAttempts: { $lt: RESET_MAX_ATTEMPTS } },
      { $inc: { resetAttempts: 1 } },
    );
    if (modifiedCount !== 1) continue;

    const given = Buffer.from(hashResetCode(user._id, cleanCode));
    const expected = Buffer.from(user.resetTokenHash);
    if (!crypto.timingSafeEqual(given, expected)) continue;

    user.password = password;
    user.resetTokenHash = undefined; // one use only
    user.resetTokenExpiresAt = undefined;
    user.resetAttempts = undefined;
    await user.save(); // validates (8+ chars), hashes, sets passwordChangedAt -> old sessions end

    // With two-step login on, the emailed code must not be a way around the app's code:
    // the password is changed, but the user still logs in normally (password + app code).
    if (user.twoFactorSecret) {
      return res.status(200).json({ message: "Password changed", twoFactorRequired: true });
    }

    setAuthCookie(res, generateToken(user));
    return res.status(200).json({
      message: "Password changed",
      user: { id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    });
  }

  return invalid();
};
