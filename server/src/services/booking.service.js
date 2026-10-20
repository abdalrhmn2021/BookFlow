const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const StaffLock = require("../models/StaffLock");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const { TIME_REGEX, isValidDate, dayNameOf, fitsInWorkingHours, localToDate } = require("../utils/time");

// Statuses that occupy a staff member's time slot.
const ACTIVE_STATUSES = ["pending", "confirmed"];

const CUSTOMER_CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000;
const MIN_REASON_LENGTH = 10;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function bookAppointment({ slug, serviceId, staffId, date, time, notes, customerId, guest, manageTokenHash }) {
  if (!slug || !serviceId || !staffId || !date || !time) {
    throw httpError(400, "slug, serviceId, staffId, date and time are required");
  }
  if (!isValidDate(date)) {
    throw httpError(400, "date must be a real date in YYYY-MM-DD format");
  }
  if (!TIME_REGEX.test(time)) {
    throw httpError(400, "time must be HH:mm (e.g. 10:30)");
  }

  const tenant = await Tenant.findOne({ slug: String(slug).toLowerCase(), isActive: true });
  if (!tenant) throw httpError(404, "Business not found");

  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne({ _id: staffId, tenantId: tenant._id, role: "staff", isActive: true }),
  ]);
  if (!service) throw httpError(404, "Service not found");
  if (!staff) throw httpError(404, "Staff member not found");

  const startTime = localToDate(date, time, tenant.timezone);
  const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

  if (startTime <= new Date()) {
    throw httpError(400, "You can't book a time in the past");
  }

  if (!fitsInWorkingHours(tenant.workingHours, dayNameOf(date), time, service.duration)) {
    throw httpError(400, "This time is outside working hours");
  }

  // Double-booking guard: every booking for a staff member bumps the same StaffLock
  // document inside the transaction, so two concurrent bookings conflict and one retries
  // (then sees the other's appointment) instead of both being saved.
  await StaffLock.updateOne({ staffId: staff._id }, { $setOnInsert: { staffId: staff._id } }, { upsert: true }).catch(
    (err) => {
      if (err.code !== 11000) throw err;
    },
  );

  let appointment = null;
  let isTaken = false;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      appointment = null;
      isTaken = false;

      await StaffLock.updateOne({ staffId: staff._id }, { $inc: { version: 1 } }, { session });

      const conflict = await Appointment.exists({
        staffId: staff._id,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      }).session(session);

      if (conflict) {
        isTaken = true;
        return;
      }

      [appointment] = await Appointment.create(
        [
          {
            tenantId: tenant._id,
            ...(customerId ? { customerId } : { guest, manageTokenHash }),
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
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (isTaken) {
    throw httpError(409, "This staff member is already booked at that time");
  }

  return { appointment, tenant, service, staff };
}

module.exports = {
  bookAppointment,
  httpError,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
};
