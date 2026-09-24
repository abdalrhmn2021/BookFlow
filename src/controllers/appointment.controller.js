const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const StaffLock = require("../models/StaffLock");
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

  // 7 + 8) Check that the staff member is free, then save - as ONE atomic step.
  //
  // Without this, two customers booking at the same moment can BOTH pass the check
  // before either one is saved -> double booking (a "race condition").
  // Proven by: node practice/test-race.js
  //
  // Make sure this staff member's lock document exists (outside the transaction).
  await StaffLock.updateOne(
    { staffId: staff._id },
    { $setOnInsert: { staffId: staff._id } },
    { upsert: true }
  ).catch((err) => {
    if (err.code !== 11000) throw err; // another request created it at the same moment - fine
  });

  let appointment = null;
  let isTaken = false;

  const session = await mongoose.startSession();
  try {
    // withTransaction re-runs this function automatically if it collides with
    // another transaction - so reset the result variables at the start of each try.
    await session.withTransaction(async () => {
      appointment = null;
      isTaken = false;

      // a) Take the key: write to the lock. If another booking for this staff member
      //    is in progress, MongoDB rejects this write (WriteConflict) and
      //    withTransaction retries us after that one has finished.
      await StaffLock.updateOne({ staffId: staff._id }, { $inc: { version: 1 } }, { session });

      // b) Now nobody else can book this staff member until we finish.
      //    Same logic as isOverlapping(), written as a MongoDB query:
      //    overlap  <=>  existing.start < new.end  AND  existing.end > new.start
      const conflict = await Appointment.exists({
        staffId: staff._id,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      }).session(session);

      if (conflict) {
        isTaken = true;
        return; // nothing to save
      }

      // c) Save - with a snapshot of the service as it is right now
      [appointment] = await Appointment.create(
        [
          {
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
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  if (isTaken) {
    return res.status(409).json({ message: "This staff member is already booked at that time" });
  }

  // First booking at this business? Link the customer to it (does nothing if already linked)
  await CustomerTenant.updateOne(
    { userId: req.user.id, tenantId: tenant._id },
    { $setOnInsert: { userId: req.user.id, tenantId: tenant._id } },
    { upsert: true }
  );

  res.status(201).json({ appointment });
};


// @route  GET /api/appointments/me
// @access customer
exports.getMyAppointments = async (req, res) => {
  const appointments = await Appointment.find({ customerId: req.user.id })
    .sort({ startTime: 1 });

  res.status(200).json({ count: appointments.length, appointments });
};