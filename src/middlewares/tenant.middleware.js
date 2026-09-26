const Tenant = require("../models/Tenant");

// Use AFTER protect. Makes sure the logged-in user belongs to a business
// (owner/staff) that is STILL ACTIVE, and exposes that business id as req.tenantId.
//
// Golden rule of multi-tenancy: tenantId comes ONLY from the authenticated
// user - never from req.body, req.query or req.params.
exports.requireTenant = async (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "This action requires a business account" });
  }

  // Why check the business on EVERY request (and not only at login)?
  // A JWT is stateless: it stays valid for 7 days no matter what happens after login.
  // If the admin disables the business an hour after the owner logged in,
  // login can't help anymore - the owner already has a valid token.
  // So we ask the database each time. exists() is cheap: it only returns the _id.
  const tenantIsActive = await Tenant.exists({ _id: req.user.tenantId, isActive: true });
  if (!tenantIsActive) {
    return res.status(403).json({ message: "This business account is disabled" });
  }

  req.tenantId = req.user.tenantId;
  next();
};
