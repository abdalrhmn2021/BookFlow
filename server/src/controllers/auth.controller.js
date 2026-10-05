const mongoose = require("mongoose");
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
      return res
        .status(400)
        .json({ message: "name, email and password are required" });
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
      return res
        .status(400)
        .json({ message: "email and password are required" });
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
        return res
          .status(403)
          .json({ message: "This business account is disabled" });
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

// @route  POST /api/auth/register-business
// @access Public (a business owner signs up their business)
//
// Creates the Tenant AND its owner User together inside a TRANSACTION:
// either both are saved, or neither is. Without it, if creating the owner
// failed (e.g. email taken) we'd be left with an orphan tenant that nobody
// owns - and its slug would be blocked forever.
// Note: MongoDB transactions need a replica set (MongoDB Atlas has one by default).
exports.registerBusiness = async (req, res) => {
  const { businessName, slug, ownerName, email, password, phone } = req.body;

  if (!businessName || !slug || !ownerName || !email || !password) {
    return res.status(400).json({
      message: "businessName, slug, ownerName, email and password are required",
    });
  }

  // Friendly early checks for clear messages. They are NOT the real guarantee -
  // two requests can still race past them; the unique indexes + transaction are.
  const [emailTaken, slugTaken] = await Promise.all([
    User.exists({ email }),
    Tenant.exists({ slug }),
  ]);
  if (emailTaken)
    return res.status(409).json({ message: "Email already exists" });
  if (slugTaken)
    return res
      .status(409)
      .json({ message: "This business URL is already taken" });

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
      // if anything above throws -> the whole transaction is rolled back
    });

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
      token: generateToken(owner),
    });
  } finally {
    // errors (duplicate key, validation) go on to the global error handler
    await session.endSession();
  }
};

// @route  GET /api/auth/me
// @access any logged-in user
// protect() already verified the token and that the user is active.
// We load the full user here because req.user only holds id/role/tenantId.
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).populate(
    "tenantId",
    "name slug",
  );

  // owner/staff: include their business, so the dashboard can show its name
  // and link to the public booking page (/book/<slug>)
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

export const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user; // عدّل الأسماء حسب الـ middleware عندك
    const reason = req.body.reason?.trim();

    if (!reason) { 
      return res.status(400).json({ message: " الاسم مطلوب" });
    }
    if (reason.length < 3) {
      return res
        .stutes(400)
        .json({ message: "الاسم يجب ان يكون اكبر من ثلاث حروف " });
    }

    // TODO 2: هات الحجز. إذا مش موجود → 404

    // TODO 3: تحقق من الصلاحية (القاعدة 1)

    // TODO 4: تحقق من الحالة (القاعدة 2)

    // TODO 5: قاعدة الساعتين للعميل فقط (القاعدة 3)

    // TODO 6: حدّث الحجز واحفظه

    // TODO 7: رجّع الحجز المحدّث
  } catch (err) {
    next(err);
  }
};
