const Tenant = require("../models/Tenant");
const { OTHER_BUSINESS_MESSAGE } = require("./site.middleware");

exports.requireTenant = async (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "This action requires a business account" });
  }

  const tenant = await Tenant.findOne({ _id: req.user.tenantId }).select("slug isActive").lean();
  if (!tenant || !tenant.isActive) {
    return res.status(403).json({ message: "This business account is disabled" });
  }

  // Same rule as login: on a one-business site, only that business's dashboard works.
  if (req.siteLocked && tenant.slug !== req.siteSlug) {
    return res.status(403).json({ message: OTHER_BUSINESS_MESSAGE });
  }

  req.tenantId = req.user.tenantId;
  next();
};
