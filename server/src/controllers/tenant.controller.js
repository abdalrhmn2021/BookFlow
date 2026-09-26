const Tenant = require("../models/Tenant");

const toTenantDTO = (t) => ({
  id: t._id,
  name: t.name,
  slug: t.slug,
  plan: t.plan,
  timezone: t.timezone,
  workingHours: t.workingHours,
});

// @route  GET /api/tenants/me
// @access owner, staff - details of MY business (id comes from the token)
exports.getMyTenant = async (req, res) => {
  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) return res.status(404).json({ message: "Business not found" });
  res.status(200).json({ tenant: toTenantDTO(tenant) });
};

// @route  PUT /api/tenants/me/working-hours
// @access owner
// Replaces the whole weekly schedule. Body: { "workingHours": [ ...7 days ] }
exports.updateWorkingHours = async (req, res) => {
  const { workingHours } = req.body;
  if (!Array.isArray(workingHours)) {
    return res.status(400).json({ message: "workingHours must be an array of 7 days" });
  }

  // keep only the known fields of each day
  const cleaned = workingHours.map(({ day, isOpen, open, close }) => ({ day, isOpen, open, close }));

  const tenant = await Tenant.findById(req.tenantId);
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  tenant.workingHours = cleaned;
  await tenant.save(); // runs all schema validators -> 400 via the global error handler

  res.status(200).json({ tenant: toTenantDTO(tenant) });
};
