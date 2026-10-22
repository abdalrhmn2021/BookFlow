const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no-show"];

const appointmentSchema = new mongoose.Schema(
  {
    tenantId: { type: ObjectId, ref: "Tenant", required: true },
    customerId: { type: ObjectId, ref: "User" },
    guest: {
      type: new mongoose.Schema(
        {
          name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [60, "Name is too long"],
          },
          phone: { type: String, required: [true, "Phone number is required"], trim: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    manageTokenHash: { type: String, select: false },
    staffId: { type: ObjectId, ref: "User", required: true },
    serviceId: { type: ObjectId, ref: "Service", required: true },

    serviceName: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    status: { type: String, enum: STATUSES, default: "pending" },
    notes: { type: String, trim: true, maxlength: [500, "Notes are too long"] },

    reminderSentAt: { type: Date },

    cancellation: {
      reason: { type: String, trim: true, maxlength: [300, "Reason is too long"] },
      cancelledBy: { type: ObjectId, ref: "User" },
      byGuest: { type: Boolean },
      cancelledAt: { type: Date },
    },
  },
  { timestamps: true },
);

appointmentSchema.pre("validate", function () {
  const hasCustomer = Boolean(this.customerId);
  const hasGuest = Boolean(this.guest);
  if (hasCustomer === hasGuest) {
    this.invalidate("customerId", "An appointment needs either a customer or a guest");
  }
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate("endTime", "endTime must be after startTime");
  }
});

appointmentSchema.index({ tenantId: 1, staffId: 1, startTime: 1 });
appointmentSchema.index({ tenantId: 1, startTime: 1 });
appointmentSchema.index({ tenantId: 1, createdAt: 1 }); // dashboard "new bookings" alerts
appointmentSchema.index({ customerId: 1, startTime: -1 });
appointmentSchema.index(
  { tenantId: 1, "guest.phone": 1, startTime: 1 },
  { partialFilterExpression: { "guest.phone": { $exists: true } } },
);

appointmentSchema.index(
  { manageTokenHash: 1 },
  { unique: true, partialFilterExpression: { manageTokenHash: { $exists: true } } },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
module.exports.STATUSES = STATUSES;
