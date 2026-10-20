const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { SINGLE_BUSINESS_SLUG } = require("../config/mode");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");

// Credentials must be real strings: an object like { "$gt": "" } would become a
// MongoDB operator inside findOne (NoSQL injection).
const isText = (value) => typeof value === "string" && value.length > 0;

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

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
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

  if (SINGLE_BUSINESS_SLUG && String(slug).trim().toLowerCase() !== SINGLE_BUSINESS_SLUG) {
    return res.status(403).json({ message: "Business registration is disabled" });
  }

  const [emailTaken, slugTaken] = await Promise.all([User.exists({ email }), Tenant.exists({ slug })]);
  if (emailTaken) return res.status(409).json({ message: "Email already exists" });
  if (slugTaken) return res.status(409).json({ message: "This business URL is already taken" });

  const session = await mongoose.startSession();
  try {
    let tenant, owner;

    await session.withTransaction(async () => {
      tenant = new Tenant({ name: businessName, slug });
      await tenant.save({ session });

      owner = new User({
        name: ownerName,
        email,
        password,
        phone,
        role: "owner",
        tenantId: tenant._id,
      });
      await owner.save({ session });
    });

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
  } finally {
    await session.endSession();
  }
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
