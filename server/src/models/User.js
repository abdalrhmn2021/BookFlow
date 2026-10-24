const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { workingDaySchema } = require("./Tenant");
const { isValidDate } = require("../utils/time");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ["superadmin", "owner", "staff", "customer"],
      required: true,
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
    // Login tokens issued before this moment stop working (see auth.middleware).
    passwordChangedAt: { type: Date },
    // "Forgot password": only the SHA-256 of the emailed token is stored, like guest booking links.
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ resetTokenHash: 1 }, { sparse: true });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  // A new password signs out every other device. Not on sign-up (nothing to sign out).
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
