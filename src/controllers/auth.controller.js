const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// @route  POST /api/auth/register
// @access Public (customer self-registration)
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: "customer",
    });

    const token = generateToken(user);

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
    // Race condition: two requests with the same email can both pass the
    // findOne check above - the unique index on email rejects the second one
    // with code 11000, which is a conflict, not a server error.
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    // Schema validation failed (e.g. password too short, bad email) - that's
    // the client's fault, so 400 with the actual reasons, not a 500.
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: "Validation failed", errors });
    }
    // log the real error on the server only - never send internals to the client
    console.error("[auth] error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// @route  POST /api/auth/login
// @access Public (all roles: customer, owner, staff, superadmin)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    // password has `select: false` on the schema, so pull it in explicitly
    const user = await User.findOne({ email }).select("+password");

    // Same generic message for "no such user" and "wrong password" on purpose,
    // so we don't leak which one was wrong.
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Only reveal "disabled" AFTER the password is verified - otherwise anyone
    // could probe emails and learn which accounts exist and are disabled.
    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    // owner/staff are tied to one tenant - make sure that business hasn't been
    // deactivated by an admin. customer/superadmin have no fixed tenantId, skip.
    if (user.role === "owner" || user.role === "staff") {
      const tenant = await Tenant.findById(user.tenantId);
      if (!tenant || !tenant.isActive) {
        return res.status(403).json({ message: "This business account is disabled" });
      }
    }

    // token payload stays generic (id + role only) - no tenantId baked in,
    // since a customer can belong to more than one tenant via CustomerTenant
    const token = generateToken(user);

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId, // returned for convenience, not part of the token
      },
      token,
    });
  } catch (error) {
    // log the real error on the server only - never send internals to the client
    console.error("[auth] error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};
