const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    // Which business owns this service - ALWAYS set from req.user, never from the client
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: [100, "Service name is too long"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description is too long"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    duration: {
      type: Number, // minutes
      required: [true, "Duration is required"],
      min: [5, "Duration must be at least 5 minutes"],
      max: [480, "Duration cannot exceed 8 hours"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Two different salons can both have "Haircut", but one salon can't have it twice
serviceSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Service", serviceSchema);
