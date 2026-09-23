const Service = require("../models/Service");

// Only these fields may be set by the client. Anything else in req.body
// (tenantId, _id, createdAt...) is ignored - this prevents "mass assignment".
const ALLOWED_FIELDS = ["name", "description", "price", "duration", "isActive"];

const pickAllowed = (body) =>
  Object.fromEntries(Object.entries(body || {}).filter(([key]) => ALLOWED_FIELDS.includes(key)));

// @route  POST /api/services
// @access owner
exports.createService = async (req, res) => {
  const service = await Service.create({
    ...pickAllowed(req.body),
    tenantId: req.tenantId, // from the verified token, NOT from the body
  });
  res.status(201).json({ service });
};

// @route  GET /api/services
// @access owner, staff - only their own business's services
exports.getServices = async (req, res) => {
  const services = await Service.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  res.status(200).json({ count: services.length, services });
};
