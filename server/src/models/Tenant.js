const mongoose = require("mongoose");
const { DAYS, TIME_REGEX, toMinutes } = require("../utils/time");

const workingDaySchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    isOpen: { type: Boolean, default: true },
    open: { type: String, match: [TIME_REGEX, "Time must be HH:mm (e.g. 09:00)"] },
    close: { type: String, match: [TIME_REGEX, "Time must be HH:mm (e.g. 17:00)"] },
  },
  { _id: false },
);

workingDaySchema.pre("validate", function () {
  if (!this.isOpen) return;
  if (!this.open || !this.close) {
    this.invalidate("open", `${this.day}: open and close times are required when the day is open`);
  } else if (!TIME_REGEX.test(this.open) || !TIME_REGEX.test(this.close)) {
    return;
  } else if (toMinutes(this.close) <= toMinutes(this.open)) {
    this.invalidate("close", `${this.day}: closing time must be after opening time`);
  }
});

const defaultWorkingHours = () =>
  DAYS.map((day) => (day === "friday" ? { day, isOpen: false } : { day, isOpen: true, open: "09:00", close: "17:00" }));

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
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and dashes"],
    },
    domain: {
      type: String,
      trim: true,
      default: null,
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
        validator: (days) => days.length === 7 && new Set(days.map((d) => d.day)).size === 7,
        message: "workingHours must contain each of the 7 days exactly once",
      },
    },
    timezone: {
      type: String,
      default: "Asia/Hebron",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Tenant", tenantSchema);
