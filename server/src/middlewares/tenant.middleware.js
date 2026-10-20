const Tenant = require("../models/Tenant");

exports.requireTenant = async (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "This action requires a business account" });
  }

  const tenantIsActive = await Tenant.exists({ _id: req.user.tenantId, isActive: true });
  if (!tenantIsActive) {
    return res.status(403).json({ message: "This business account is disabled" });
  }

  req.tenantId = req.user.tenantId;
  next();
};
