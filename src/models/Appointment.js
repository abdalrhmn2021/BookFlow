const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no-show"];

const appointmentSchema = new mongoose.Schema(
  {
    // --- Who and where ---
    tenantId: { type: ObjectId, ref: "Tenant", required: true },
    customerId: { type: ObjectId, ref: "User", required: true },
    staffId: { type: ObjectId, ref: "User", required: true },
    serviceId: { type: ObjectId, ref: "Service", required: true },

    // --- Snapshot: the service as it was at booking time ---
    // If the owner changes the price later, old appointments keep the original one.
    serviceName: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true }, // minutes

    // --- When ---
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    status: { type: String, enum: STATUSES, default: "pending" },
    notes: { type: String, trim: true, maxlength: [500, "Notes are too long"] },
  },
  { timestamps: true }
);

// endTime must come after startTime
appointmentSchema.pre("validate", function () {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate("endTime", "endTime must be after startTime");
  }
});

// Fast search for a staff member's appointments (used for the overlap check)
appointmentSchema.index({ tenantId: 1, staffId: 1, startTime: 1 });
// Fast "my appointments" list for a customer
appointmentSchema.index({ customerId: 1, startTime: -1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
module.exports.STATUSES = STATUSES;
