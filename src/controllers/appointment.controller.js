const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const CustomerTenant = require("../models/CustomerTenant");
const {
  TIME_REGEX,
  isValidDate,
  dayNameOf,
  fitsInWorkingHours,
  localToDate,
} = require("../utils/time");

// Only these statuses block the staff member's time.
// A cancelled / no-show appointment frees the slot again.
const ACTIVE_STATUSES = ["pending", "confirmed"];

// @route  POST /api/appointments
// @access customer
// Body: { slug, serviceId, staffId, date: "2026-09-25", time: "10:30", notes? }
exports.createAppointment = async (req, res) => {
  const { slug, serviceId, staffId, date, time, notes } = req.body || {};

  // 0) Basic input checks
  if (!slug || !serviceId || !staffId || !date || !time) {
    return res.status(400).json({ message: "slug, serviceId, staffId, date and time are required" });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "date must be a real date in YYYY-MM-DD format" });
  }
  if (!TIME_REGEX.test(time)) {
    return res.status(400).json({ message: "time must be HH:mm (e.g. 10:30)" });
  }

  // 1) The business must exist and be active
  const tenant = await Tenant.findOne({ slug, isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  // 2 + 3) Service and staff must belong to THIS business (never trust ids alone - IDOR)
  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne({ _id: staffId, tenantId: tenant._id, role: "staff", isActive: true }),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  // 4) The server calculates the end - the client never sends it
  const startTime = localToDate(date, time, tenant.timezone);
  const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

  // 5) No bookings in the past
  if (startTime <= new Date()) {
    return res.status(400).json({ message: "You can't book a time in the past" });
  }

  // 6) Must fit completely inside the business's working hours
  if (!fitsInWorkingHours(tenant.workingHours, dayNameOf(date), time, service.duration)) {
    return res.status(400).json({ message: "This time is outside working hours" });
  }

  // 7) Is the staff member free?  Same logic as isOverlapping(), written as a MongoDB query:
  //    overlap  <=>  existing.start < new.end  AND  existing.end > new.start
  const conflict = await Appointment.exists({
    staffId: staff._id,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
  if (conflict) {
    return res.status(409).json({ message: "This staff member is already booked at that time" });
  }

  // 8) Save - with a snapshot of the service as it is right now
  const appointment = await Appointment.create({
    tenantId: tenant._id,
    customerId: req.user.id, // from the verified token
    staffId: staff._id,
    serviceId: service._id,
    serviceName: service.name,
    price: service.price,
    duration: service.duration,
    startTime,
    endTime,
    notes,
  });

  // First booking at this business? Link the customer to it (does nothing if already linked)
  await CustomerTenant.updateOne(
    { userId: req.user.id, tenantId: tenant._id },
    { $setOnInsert: { userId: req.user.id, tenantId: tenant._id } },
    { upsert: true }
  );

  res.status(201).json({ appointment });
};
