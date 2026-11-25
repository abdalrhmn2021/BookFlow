const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const { readAuthCookie } = require("../utils/authCookie");
const { customerScope, OTHER_BUSINESS_MESSAGE } = require("./site.middleware");
const { needsVerification } = require("../services/emailVerification.service");
const { isId } = require("../utils/ids");

// What jsonwebtoken throws for a token that is bad, expired or not valid yet. Only these mean
// "you are not logged in" (401). Anything else - the database not answering, a bug - is a server
// error and goes to the error handler (500 + the ALERT_EMAIL alert), so an outage isn't hidden
// behind "please log in again".
const TOKEN_ERRORS = new Set(["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"]);
const INVALID_TOKEN = { message: "Not authorized, invalid token" };

function readToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : readAuthCookie(req);
}

// GET /auth/session: a visitor with no login at all gets { user: null } (200) instead of a 401, so
// every page load of a logged-out visitor doesn't log an error in the browser console. As soon as
// there is any token - even a bad or expired one - protect decides, exactly as for /auth/me.
exports.skipIfNoToken = (req, res, next) => {
  let token;
  try {
    token = readToken(req);
  } catch {
    return next(); // a malformed cookie: protect answers it (401)
  }
  if (!token) return res.status(200).json({ user: null });
  next();
};

exports.protect = async (req, res, next) => {
  let token;
  let decoded;
  try {
    token = readToken(req);
    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }
    // Only the algorithm we sign with (review A-08): a token made any other way is refused.
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    // A malformed cookie (URIError from decodeURIComponent) is the client's fault too.
    if (TOKEN_ERRORS.has(err?.name) || err instanceof URIError) {
      return res.status(401).json(INVALID_TOKEN);
    }
    return next(err);
  }

  // We only sign { id: <ObjectId> }. Anything else can't be one of our tokens (and must not reach
  // findById, where it would become a CastError).
  if (!decoded || typeof decoded !== "object" || !isId(decoded.id)) {
    return res.status(401).json(INVALID_TOKEN);
  }

  // From here on the token itself is valid: an error now is a server problem, not a bad login.
  // next(err) and nothing else, so a failed check can never fall through to the route.
  try {
    // Both lookups at once: each trip to the database is a round trip (~180ms when Render and
    // Atlas are far apart), and they don't depend on each other. Every check below still runs,
    // in the same order, before the route is reached.
    const [revoked, user] = await Promise.all([
      decoded.jti ? RevokedToken.exists({ jti: decoded.jti }) : null,
      User.findById(decoded.id),
    ]);

    // Logged out: this token was revoked (auth.controller logout), even if it hasn't expired yet.
    if (revoked) {
      return res.status(401).json({ message: "You logged out, please log in again" });
    }

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    // No login is handed out before the email is confirmed; this keeps it so for any token anyway.
    if (needsVerification(user)) {
      return res.status(403).json({ message: "Please confirm your email first", verificationRequired: true });
    }

    // Compared in whole seconds (a JWT's iat has no milliseconds), so the token issued
    // right after the change, in the same second, still works.
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ message: "Your password was changed, please log in again" });
    }

    // Shared server: a customer account made on salon A's site belongs to salon A only. Its token
    // must not work on salon B's site or straight on the server (where it would book anywhere).
    if (user.scope && String(user.scope) !== String(await customerScope(req))) {
      return res.status(403).json({ message: OTHER_BUSINESS_MESSAGE });
    }

    req.user = {
      id: user._id,
      role: user.role,
      tenantId: user.tenantId,
    };
    // The whole document, set only after every check above passed, so a route that needs more of
    // this user (GET /auth/me) doesn't fetch it from the database again.
    req.authUser = user;
  } catch (err) {
    return next(err);
  }
  next();
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
};
