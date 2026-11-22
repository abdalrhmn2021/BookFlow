const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { workingDaySchema } = require("./Tenant");
const { isValidDate } = require("../utils/time");
const { normalizePhone, PHONE_REGEX } = require("../utils/phone");

// bcrypt cost (security review): 12 by default, ~4x slower to guess than 10. Never below 10.
// Older hashes (cost 10) keep working. Tests set BCRYPT_ROUNDS=10 to stay fast.
const bcryptRounds = () => {
  const n = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(n) && n >= 10 && n <= 15 ? n : 12;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [60, "Name is too long"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      maxlength: [254, "Email is too long"],
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      // bcrypt only uses the first 72 bytes: a longer password would silently match any other
      // password with the same start. Checked only when it's set or changed (not on the stored hash).
      validate: {
        validator(v) {
          if (typeof this?.isModified === "function" && !this.isModified("password")) return true;
          return typeof v !== "string" || Buffer.byteLength(v, "utf8") <= 72;
        },
        message: "Password is too long (72 bytes max)",
      },
      select: false,
    },
    // Same cleaning and format as guests' phones ("0599 123-456" -> "0599123456"). Checked only
    // when it's set or changed, so an older account with an odd phone can still log in and save.
    phone: {
      type: String,
      trim: true,
      set: (v) => (typeof v === "string" ? normalizePhone(v) : v),
      validate: {
        validator(v) {
          if (typeof this?.isModified === "function" && !this.isModified("phone")) return true;
          return !v || PHONE_REGEX.test(v);
        },
        message: "Please provide a valid phone number",
      },
    },
    role: {
      type: String,
      enum: ["superadmin", "owner", "staff", "customer"],
      required: true,
    },
    // Customers who signed up on one business's site of a SHARED server belong to that
    // business only (each salon has its own customers). null = a normal account: owners, staff,
    // admins, and every customer on the platform / a dedicated server.
    scope: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Owner only: "I take bookings too" (a barber who runs the shop alone). Then customers can
    // book them like a staff member, with their own hours / services / days off below.
    bookable: { type: Boolean },

    // ---- Staff only (utils/staffSchedule.js). Not set = same as the business. ----
    // Their own week: the business's hours are narrowed to these (never widened).
    workingHours: {
      type: [workingDaySchema],
      default: undefined,
      validate: {
        validator: (days) =>
          !days || days.length === 0 || (days.length === 7 && new Set(days.map((d) => d.day)).size === 7),
        message: "workingHours must contain each of the 7 days exactly once",
      },
    },
    // The services they do. Empty = all of them.
    services: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
      default: undefined,
    },
    // Single days off (holiday, sick day...), as YYYY-MM-DD in the business's time zone.
    daysOff: {
      type: [String],
      default: undefined,
      validate: [
        { validator: (dates) => !dates || dates.every(isValidDate), message: "Days off must be dates like 2026-11-05" },
        { validator: (dates) => !dates || dates.length <= 120, message: "Too many days off (120 max)" },
      ],
    },
    // Email verification (services/emailVerification.service.js). false = signed up, code not
    // typed yet: can't log in. Not set (older accounts, staff, scripts) or true = verified.
    // Only an HMAC of the code is stored, with an expiry and a count of wrong tries.
    emailVerified: { type: Boolean },
    verifyCodeHash: { type: String, select: false },
    verifyExpiresAt: { type: Date, select: false },
    verifyAttempts: { type: Number, select: false },
    // Login tokens issued before this moment stop working (see auth.middleware).
    passwordChangedAt: { type: Date },
    // "Forgot password": a 6-digit code sent by email. Only its HMAC is stored (never the code),
    // with an expiry and a count of wrong tries (the code dies after 5) - see auth.controller.
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    resetAttempts: { type: Number, select: false },
    // Two-step login (utils/totp.js), turned on with `npm run two-factor`. Not set = off.
    // twoFactorLastStep: the last code's 30-second step, so the same code can't be used twice.
    twoFactorSecret: { type: String, select: false },
    twoFactorLastStep: { type: Number, select: false },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ resetTokenHash: 1 }, { sparse: true });
// One account per email in each scope: the same person can be a customer at two salons
// on a shared server, with two separate accounts.
userSchema.index({ email: 1, scope: 1 }, { unique: true });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(bcryptRounds());
  this.password = await bcrypt.hash(this.password, salt);
  // A new password signs out every other device. Not on sign-up (nothing to sign out).
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

// Databases created before `scope` have a unique index on email alone, which would refuse a
// second account with the same email. Dropped once at start-up (config/db.js); harmless after.
User.dropLegacyEmailIndex = async () => {
  const indexes = await User.collection.indexes().catch(() => []);
  if (indexes.some((i) => i.name === "email_1")) {
    await User.collection.dropIndex("email_1");
    console.log("[db] replaced the old unique email index with (email, scope)");
  }
  await User.createIndexes();
};

User.bcryptRounds = bcryptRounds;

module.exports = User;
