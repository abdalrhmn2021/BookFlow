const Tenant = require("../models/Tenant");

const toTenantDTO = (t) => ({
  id: t._id,
  name: t.name,
  slug: t.slug,
  plan: t.plan,
  timezone: t.timezone,
  workingHours: t.workingHours,
});

exports.getMyTenant = async (req, res) => {
  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) return res.status(404).json({ message: "Business not found" });
  res.status(200).json({ tenant: toTenantDTO(tenant) });
};

exports.updateWorkingHours = async (req, res) => {
  const { workingHours } = req.body;
  if (!Array.isArray(workingHours)) {
    return res.status(400).json({ message: "workingHours must be an array of 7 days" });
  }

  const cleaned = workingHours.map(({ day, isOpen, open, close }) => ({ day, isOpen, open, close }));

  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  tenant.workingHours = cleaned;
  await tenant.save();

  res.status(200).json({ tenant: toTenantDTO(tenant) });
};
