const User = require("../models/User");

const CREATE_FIELDS = ["name", "email", "password", "phone"];
const UPDATE_FIELDS = ["name", "phone", "isActive"];

const pick = (body, allowed) => Object.fromEntries(Object.entries(body || {}).filter(([key]) => allowed.includes(key)));

const toStaffDTO = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

const staffFilter = (req, extra = {}) => ({ tenantId: req.tenantId, role: "staff", ...extra });

exports.createStaff = async (req, res) => {
  const data = pick(req.body, CREATE_FIELDS);

  if (!data.name || !data.email || !data.password) {
    return res.status(400).json({ message: "name, email and password are required" });
  }

  const staff = await User.create({
    ...data,
    role: "staff",
    tenantId: req.tenantId,
  });

  res.status(201).json({ staff: toStaffDTO(staff) });
};

exports.getStaff = async (req, res) => {
  const staff = await User.find(staffFilter(req)).sort({ createdAt: -1 });
  res.status(200).json({ count: staff.length, staff: staff.map(toStaffDTO) });
};

exports.updateStaff = async (req, res) => {
  const staff = await User.findOneAndUpdate(staffFilter(req, { _id: req.params.id }), pick(req.body, UPDATE_FIELDS), {
    returnDocument: "after",
    runValidators: true,
  });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });
  res.status(200).json({ staff: toStaffDTO(staff) });
};

exports.deactivateStaff = async (req, res) => {
  const staff = await User.findOneAndUpdate(
    staffFilter(req, { _id: req.params.id }),
    { isActive: false },
    { returnDocument: "after" },
  );
  if (!staff) return res.status(404).json({ message: "Staff member not found" });
  res.status(200).json({ message: "Staff member deactivated", staff: toStaffDTO(staff) });
};
