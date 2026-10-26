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

// Every message is a Gemini call on the seller's key.
exports.assistantLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Too many messages, please try again in a few minutes" },
});

exports.manageBookingLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: "Too many requests, please slow down" },
});
