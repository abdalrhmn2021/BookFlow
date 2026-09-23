// Use AFTER protect. Makes sure the logged-in user belongs to a business
// (owner/staff) and exposes that business id as req.tenantId.
//
// Golden rule of multi-tenancy: tenantId comes ONLY from the authenticated
// user - never from req.body, req.query or req.params.
exports.requireTenant = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "This action requires a business account" });
  }
  req.tenantId = req.user.tenantId;
  next();
};
