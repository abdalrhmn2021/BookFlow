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

// IMPORTANT: every query by id ALSO filters by tenantId.
// Looking up by _id alone would let one salon read/edit/delete another salon's
// services just by guessing or copying an id (IDOR). If the service belongs to
// a different tenant we answer 404 - not 403 - so we don't even confirm it exists.

// @route  GET /api/services/:id
// @access owner, staff
exports.getService = async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ service });
};

// @route  PATCH /api/services/:id
// @access owner
exports.updateService = async (req, res) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    pickAllowed(req.body),
    { returnDocument: "after", runValidators: true }
  );
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ service });
};

// @route  DELETE /api/services/:id
// @access owner
// Soft delete: old appointments still reference this service, so we deactivate
// it instead of removing it from the database.
exports.deleteService = async (req, res) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { returnDocument: "after" }
  );
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ message: "Service deactivated", service });
};
