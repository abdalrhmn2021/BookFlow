const User = require("../models/User");
const Service = require("../models/Service");

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
  // null = works the business's hours; [] = does every service.
  workingHours: u.workingHours?.length ? u.workingHours : null,
  services: u.services ?? [],
  daysOff: [...(u.daysOff ?? [])].sort(),
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

// PUT /api/staff/:id/schedule  { workingHours: [7 days] | null, services: [ids], daysOff: ["YYYY-MM-DD"] }
// Every field is optional; null/[] resets it to "same as the business" / "every service" / "no days off".
exports.updateStaffSchedule = async (req, res) => {
  const { workingHours, services, daysOff } = req.body || {};
  const staff = await User.findOne(staffFilter(req, { _id: req.params.id }));
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  if (workingHours !== undefined) {
    if (workingHours === null || (Array.isArray(workingHours) && workingHours.length === 0)) {
      staff.workingHours = undefined;
    } else if (Array.isArray(workingHours)) {
      staff.workingHours = workingHours.map(({ day, isOpen, open, close }) => ({ day, isOpen, open, close }));
    } else {
      return res.status(400).json({ message: "workingHours must be an array of 7 days or null" });
    }
  }

  if (services !== undefined) {
    if (!Array.isArray(services) || !services.every((id) => typeof id === "string")) {
      return res.status(400).json({ message: "services must be a list of service ids" });
    }
    const unique = [...new Set(services)];
    const found = unique.length
      ? await Service.countDocuments({ _id: { $in: unique }, tenantId: req.tenantId, isActive: true })
      : 0;
    if (found !== unique.length) return res.status(400).json({ message: "Service not found" });
    staff.services = unique.length ? unique : undefined;
  }

  if (daysOff !== undefined) {
    if (!Array.isArray(daysOff) || !daysOff.every((d) => typeof d === "string")) {
      return res.status(400).json({ message: "daysOff must be a list of dates" });
    }
    const unique = [...new Set(daysOff)].sort();
    staff.daysOff = unique.length ? unique : undefined;
  }

  await staff.save(); // runs the model's validators (7 days, HH:mm, real dates)
  res.status(200).json({ staff: toStaffDTO(staff) });
};
