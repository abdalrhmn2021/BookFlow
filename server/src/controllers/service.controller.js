const Service = require("../models/Service");

const ALLOWED_FIELDS = ["name", "description", "price", "duration", "isActive"];

const pickAllowed = (body) =>
  Object.fromEntries(Object.entries(body || {}).filter(([key]) => ALLOWED_FIELDS.includes(key)));

exports.createService = async (req, res) => {
  const service = await Service.create({
    ...pickAllowed(req.body),
    tenantId: req.tenantId,
  });
  res.status(201).json({ service });
};

exports.getServices = async (req, res) => {
  const services = await Service.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  res.status(200).json({ count: services.length, services });
};

exports.getService = async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ service });
};

exports.updateService = async (req, res) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    pickAllowed(req.body),
    { returnDocument: "after", runValidators: true },
  );
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ service });
};

exports.deleteService = async (req, res) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { returnDocument: "after" },
  );
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.status(200).json({ message: "Service deactivated", service });
};
