const Tenant = require("../models/Tenant");
const { OTHER_BUSINESS_MESSAGE } = require("./site.middleware");

exports.requireTenant = async (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "This action requires a business account" });
  }

  // timezone too: the dashboard's read routes need it, and reading it here saves them a second
  // trip to the database for the same business.
  const tenant = await Tenant.findOne({ _id: req.user.tenantId }).select("slug isActive timezone").lean();
  if (!tenant || !tenant.isActive) {
    return res.status(403).json({ message: "This business account is disabled" });
  }

  // Same rule as login: on a one-business site, only that business's dashboard works.
  if (req.siteLocked && tenant.slug !== req.siteSlug) {
    return res.status(403).json({ message: OTHER_BUSINESS_MESSAGE });
  }

  req.tenantId = req.user.tenantId;
  req.tenantTimezone = tenant.timezone;
  next();
};
