const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { readAuthCookie } = require("../utils/authCookie");
const { customerScope, OTHER_BUSINESS_MESSAGE } = require("./site.middleware");

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : readAuthCookie(req);

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
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

    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
};
