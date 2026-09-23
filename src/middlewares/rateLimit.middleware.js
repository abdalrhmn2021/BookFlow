const { rateLimit } = require("express-rate-limit");

// Brute-force protection for login: after 5 FAILED attempts from the same IP
// within 15 minutes, block further attempts until the window resets.
// Successful logins don't count, so a real user who logs in normally is never blocked.
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8", // sends RateLimit-* headers so the client knows when to retry
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in 15 minutes" },
});

// Looser limit for registration - stops bots from mass-creating accounts
exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many accounts created from this IP, please try again later" },
});
