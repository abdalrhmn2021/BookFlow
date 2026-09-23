const mongoose = require("mongoose");
const { DAYS, TIME_REGEX, toMinutes } = require("../utils/time");

// One row of the weekly schedule, e.g. { day: "saturday", isOpen: true, open: "09:00", close: "17:00" }
const workingDaySchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    isOpen: { type: Boolean, default: true },
    open: { type: String, match: [TIME_REGEX, "Time must be HH:mm (e.g. 09:00)"] },
    close: { type: String, match: [TIME_REGEX, "Time must be HH:mm (e.g. 17:00)"] },
  },
  { _id: false }
);

// An open day must have open/close times, and close must be after open
workingDaySchema.pre("validate", function () {
  if (!this.isOpen) return;
  if (!this.open || !this.close) {
    this.invalidate("open", `${this.day}: open and close times are required when the day is open`);
  } else if (!TIME_REGEX.test(this.open) || !TIME_REGEX.test(this.close)) {
    return; // bad format - the `match` validator reports it
  } else if (toMinutes(this.close) <= toMinutes(this.open)) {
    this.invalidate("close", `${this.day}: closing time must be after opening time`);
  }
});

// Default for new businesses: Saturday-Thursday 09:00-17:00, Friday closed
const defaultWorkingHours = () =>
  DAYS.map((day) =>
    day === "friday" ? { day, isOpen: false } : { day, isOpen: true, open: "09:00", close: "17:00" }
  );

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tenant name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Slug must be at least 3 characters"],
      maxlength: [40, "Slug must be at most 40 characters"],
      // used in public URLs (/book/al-ward): lowercase letters, numbers and single dashes only
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and dashes"],
    },
    domain: {
      type: String,
      trim: true,
      default: null, // custom domain/subdomain, optional for now
    },
    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    workingHours: {
      type: [workingDaySchema],
      default: defaultWorkingHours,
      validate: {
        // exactly one entry per day of the week
        validator: (days) => days.length === 7 && new Set(days.map((d) => d.day)).size === 7,
        message: "workingHours must contain each of the 7 days exactly once",
      },
    },
    timezone: {
      type: String,
      default: "Asia/Hebron", // appointment times are interpreted in the business's local time
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

module.exports = mongoose.model("Tenant", tenantSchema);
