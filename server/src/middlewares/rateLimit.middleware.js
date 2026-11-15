const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Count per visitor: req.clientIp is the real visitor IP when the request came through one of
// our sites' proxies (see site.middleware.js). ipKeyGenerator groups IPv6 addresses by subnet,
// so one visitor can't dodge the limit by rotating through the addresses of their network.
const base = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
};

exports.loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts, please try again in 15 minutes" },
});

// The per-IP limit above stops one visitor. Someone with many IPs (proxies, a botnet) gets 5 tries
// on EACH of them, so the same account is also counted on its own: 10 wrong passwords in 15 minutes
// for one email, whatever the IP. Counted for every email, known or not, so a 429 says nothing
// about whether an account exists. The demo accounts are skipped: their password is public anyway,
// and a stranger must not be able to lock everyone else out of the demo.
const { isDemoEmail } = require("../config/demo");
const loginEmail = (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");

exports.loginEmailLimiter = rateLimit({
  standardHeaders: "draft-8",
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  skip: (req) => !loginEmail(req) || isDemoEmail(loginEmail(req)),
  keyGenerator: (req) => `email:${loginEmail(req)}`,
  message: { message: "Too many failed attempts on this account, please try again in 15 minutes" },
});

// Same idea for the forms that ask a logged-in user for their password again (change password,
// delete account): counted per account, so a stolen session can't guess the password from many IPs.
exports.accountPasswordLimiter = rateLimit({
  standardHeaders: "draft-8",
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { message: "Too many failed attempts on this account, please try again in 15 minutes" },
});

exports.registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { message: "Too many accounts created from this IP, please try again later" },
});

// Each request can send an email, so keep it low.
exports.forgotPasswordLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: "Too many reset requests, please try again later" },
});

// New reset codes per email, from any IP: each new code gives 5 more guesses (and an email in the
// victim's inbox), so this is what keeps a 6-digit code safe. 3 an hour, every email counted.
exports.forgotEmailLimiter = rateLimit({
  standardHeaders: "draft-8",
  legacyHeaders: false,
  windowMs: 60 * 60 * 1000,
  limit: 3,
  skip: (req) => !loginEmail(req),
  keyGenerator: (req) => `forgot:${loginEmail(req)}`,
  message: { message: "Too many codes requested for this email, please try again in an hour" },
});

exports.resetPasswordLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many attempts, please try again in 15 minutes" },
});

exports.publicLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { message: "Too many requests, please slow down" },
});

exports.guestBookingLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { message: "Too many bookings from this device, please try again later" },
});

exports.manageBookingLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: "Too many requests, please slow down" },
});
