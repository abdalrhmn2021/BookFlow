const User = require("../models/User");

// The ONLY fields an owner may send when creating a staff member.
// role and tenantId are NOT here - the server decides them (see createStaff).
const CREATE_FIELDS = ["name", "email", "password", "phone"];
// When updating, email/password/role/tenantId can't be changed through this route.
const UPDATE_FIELDS = ["name", "phone", "isActive"];

const pick = (body, allowed) =>
  Object.fromEntries(Object.entries(body || {}).filter(([key]) => allowed.includes(key)));

// Shape returned to the client - never includes the password hash
const toStaffDTO = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

// Every query targets ONLY staff of the current business.
// role: "staff" also stops an owner from editing/disabling another owner (or themselves) here.
const staffFilter = (req, extra = {}) => ({ tenantId: req.tenantId, role: "staff", ...extra });

// @route  POST /api/staff
// @access owner
exports.createStaff = async (req, res) => {
  const data = pick(req.body, CREATE_FIELDS);

  if (!data.name || !data.email || !data.password) {
    return res.status(400).json({ message: "name, email and password are required" });
  }

  const staff = await User.create({
    ...data,
    role: "staff", // decided by the server - never taken from req.body
    tenantId: req.tenantId, // the owner's business - from the verified token
  });
  // duplicate email (11000) and validation errors are handled by the global error handler

  res.status(201).json({ staff: toStaffDTO(staff) });
};

// @route  GET /api/staff
// @access owner
exports.getStaff = async (req, res) => {
  const staff = await User.find(staffFilter(req)).sort({ createdAt: -1 });
  res.status(200).json({ count: staff.length, staff: staff.map(toStaffDTO) });
};

// @route  PATCH /api/staff/:id
// @access owner
exports.updateStaff = async (req, res) => {
  const staff = await User.findOneAndUpdate(
    staffFilter(req, { _id: req.params.id }),
    pick(req.body, UPDATE_FIELDS),
    { new: true, runValidators: true }
  );
  if (!staff) return res.status(404).json({ message: "Staff member not found" });
  res.status(200).json({ staff: toStaffDTO(staff) });
};

// @route  DELETE /api/staff/:id
// @access owner
// Soft delete: the account is disabled (protect() rejects inactive users),
// but their past appointments keep pointing to a real user.
exports.deactivateStaff = async (req, res) => {
  const staff = await User.findOneAndUpdate(
    staffFilter(req, { _id: req.params.id }),
    { isActive: false },
    { new: true }
  );
  if (!staff) return res.status(404).json({ message: "Staff member not found" });
  res.status(200).json({ message: "Staff member deactivated", staff: toStaffDTO(staff) });
};
