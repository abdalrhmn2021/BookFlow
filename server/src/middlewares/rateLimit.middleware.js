const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { clientIp } = require("../utils/clientIp");

// Every limiter counts per visitor (their real IP, see utils/clientIp), not per Vercel server.
// ipKeyGenerator groups an IPv6 address by its /56 block, so one device can't rotate addresses.
const limiter = (options) =>
  rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    ...options,
  });

exports.loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts, please try again in 15 minutes" },
});

exports.registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { message: "Too many accounts created from this IP, please try again later" },
});

// Each request can send an email, so keep it low.
exports.forgotPasswordLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: "Too many reset requests, please try again later" },
});

exports.resetPasswordLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many attempts, please try again in 15 minutes" },
});

exports.publicLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { message: "Too many requests, please slow down" },
});

exports.guestBookingLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { message: "Too many bookings from this device, please try again later" },
});

exports.manageBookingLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: "Too many requests, please slow down" },
});
