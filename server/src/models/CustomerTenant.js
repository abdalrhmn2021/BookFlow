const mongoose = require("mongoose");

const customerTenantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

customerTenantSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model("CustomerTenant", customerTenantSchema);
