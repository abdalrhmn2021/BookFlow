const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { SINGLE_BUSINESS_SLUG, SHARED_SERVER } = require("../config/mode");
const { siteAllows, customerScope, OTHER_BUSINESS_MESSAGE } = require("../middlewares/site.middleware");
const { isDemoEmail } = require("../config/demo");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");
const { siteUrl } = require("../utils/siteUrl");
const { createBusinessWithOwner } = require("../services/business.service");
const { isEmailConfigured, sendPasswordResetEmail } = require("../services/notify.service");

// Credentials must be real strings: an object like { "$gt": "" } would become a
// MongoDB operator inside findOne (NoSQL injection).
const isText = (value) => typeof value === "string" && value.length > 0;

// Accounts this email may sign in to here, this site's own first.
async function accountsFor(req, email, extra = {}) {
  const scope = await customerScope(req);
  const scopes = scope ? [scope, null] : [null];
  const users = await User.find({ email: String(email).trim().toLowerCase(), scope: { $in: scopes }, ...extra }).select(
    "+password",
  );
  return users.sort((a, b) => Number(Boolean(b.scope)) - Number(Boolean(a.scope)));
}

async function findAccount(req, email, password) {
  for (const user of await accountsFor(req, email)) {
    if (await user.comparePassword(password)) return user;
  }
  return null;
}

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!isText(name) || !isText(email) || !isText(password)) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    // On a shared server the account belongs to this site's business only.
    const scope = await customerScope(req);
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
      token,
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
    const { email, password } = req.body;

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
      token,
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
    token,
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
  await user.save(); // validates (8+ chars), hashes, sets passwordChangedAt

  setAuthCookie(res, generateToken(user));
  res.status(200).json({ message: "Password changed" });
};

const RESET_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const RESET_MINUTES = 30;
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const RESET_SENT = "If this email has an account, a reset link is on its way";

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
  const site = siteUrl(req);

  // On a one-business site, don't send salon A's owner a link to salon B's site
  // (same answer either way, so nobody learns which emails exist).
  if (user && site && (await canSignInHere(req, user))) {
    const token = crypto.randomBytes(32).toString("base64url");
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetTokenHash: hashResetToken(token),
          resetTokenExpiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
        },
      },
    );
    sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      link: `${site}/reset-password/${token}`,
      minutes: RESET_MINUTES,
    }).catch((err) => console.error("[notify] password reset email failed:", err.message));
  }

  res.status(200).json({ message: RESET_SENT });
};

// The link from the email: a new password, and the user is logged in.
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (!isText(token) || !isText(password)) {
    return res.status(400).json({ message: "token and password are required" });
  }

  const invalid = () => res.status(400).json({ message: "This reset link is invalid or has expired" });
  if (!RESET_TOKEN_REGEX.test(token)) return invalid();

  const user = await User.findOne({
    resetTokenHash: hashResetToken(token),
    resetTokenExpiresAt: { $gt: new Date() },
    isActive: true,
  });
  if (!user) return invalid();

  user.password = password;
  user.resetTokenHash = undefined; // one use only
  user.resetTokenExpiresAt = undefined;
  await user.save(); // validates (8+ chars), hashes, sets passwordChangedAt -> old sessions end

  setAuthCookie(res, generateToken(user));
  res.status(200).json({
    message: "Password changed",
    user: { id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
  });
};
