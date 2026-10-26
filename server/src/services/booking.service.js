const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const StaffLock = require("../models/StaffLock");
const GuestLock = require("../models/GuestLock");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const { bookableFilter } = require("../utils/bookable");
const { staffDayHours, offersService } = require("../utils/staffSchedule");
const {
  TIME_REGEX,
  isValidDate,
  dayNameOf,
  fitsInWorkingHours,
  localToDate,
  toMinutes,
  toHHMM,
  isOverlapping,
  nextDate,
} = require("../utils/time");

// Statuses that occupy a staff member's time slot.
const ACTIVE_STATUSES = ["pending", "confirmed"];

const CUSTOMER_CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000;
const MIN_REASON_LENGTH = 10;
const SLOT_STEP = 15;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Double-booking guard: every write to a staff member's calendar bumps the same StaffLock
// document inside the transaction, so two concurrent writes conflict and one retries
// (and then sees the other's appointment) instead of both being saved.
async function withStaffLock(staffId, work) {
  await StaffLock.updateOne({ staffId }, { $setOnInsert: { staffId } }, { upsert: true }).catch((err) => {
    if (err.code !== 11000) throw err;
  });

  let result;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await StaffLock.updateOne({ staffId }, { $inc: { version: 1 } }, { session });
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

const hasConflict = (staffId, startTime, endTime, session, excludeId) =>
  Appointment.exists({
    staffId,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    ...(excludeId && { _id: { $ne: excludeId } }),
  }).session(session);

// The checks every new time goes through: real date and time, not in the past, inside the
// business's working hours AND the staff member's own hours (utils/staffSchedule.js).
function checkTime({ tenant, staff, date, time, duration }) {
  const times = checkBusinessTime({ tenant, date, time, duration });
  if (!worksAt(tenant, staff, date, time, duration)) {
    throw httpError(400, "This staff member isn't working at that time");
  }
  return times;
}

// The part that is the same for everyone at the business (date, past, business hours).
function checkBusinessTime({ tenant, date, time, duration }) {
  if (!date || !time) throw httpError(400, "date and time are required");
  if (!isValidDate(date)) throw httpError(400, "date must be a real date in YYYY-MM-DD format");
  if (!TIME_REGEX.test(time)) throw httpError(400, "time must be HH:mm (e.g. 10:30)");

  const startTime = localToDate(date, time, tenant.timezone);
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  if (startTime <= new Date()) throw httpError(400, "You can't book a time in the past");
  if (!fitsInWorkingHours(tenant.workingHours, dayNameOf(date), time, duration)) {
    throw httpError(400, "This time is outside working hours");
  }
  return { startTime, endTime };
}

// Inside this person's own hours that day (and not a day off)?
function worksAt(tenant, staff, date, time, duration) {
  const hours = staffDayHours(tenant, staff, date);
  const start = toMinutes(time);
  return hours.isOpen && start >= toMinutes(hours.open) && start + duration <= toMinutes(hours.close);
}

// "Any staff member" on the booking page: staffId = ANY_STAFF.
const ANY_STAFF = "any";
const NOBODY_FREE = "Nobody is free at that time, please pick another time";

// Everyone at this business who can be booked for this service (staff + an owner taking bookings).
async function peopleForService(tenant, service) {
  const people = await User.find(bookableFilter(tenant._id)).sort({ name: 1 });
  return people.filter((p) => offersService(p, service._id));
}

// Saves the appointment for this person under their lock, or returns null if they're taken.
// guestLimit: { tenantId, phone, max } - the guest's own limit, checked under their phone lock
// in the same transaction, so parallel bookings from one phone can't all pass the count.
async function insertWithLock(staff, startTime, endTime, fields, guestLimit) {
  const guestKey = guestLimit && `${guestLimit.tenantId}:${guestLimit.phone}`;
  if (guestKey) {
    await GuestLock.updateOne({ key: guestKey }, { $setOnInsert: { key: guestKey } }, { upsert: true }).catch((err) => {
      if (err.code !== 11000) throw err;
    });
  }
  return withStaffLock(staff._id, async (session) => {
    if (guestKey) {
      await GuestLock.updateOne({ key: guestKey }, { $inc: { version: 1 } }, { session });
      const upcoming = await Appointment.countDocuments({
        tenantId: guestLimit.tenantId,
        "guest.phone": guestLimit.phone,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $gte: new Date() },
      }).session(session);
      if (upcoming >= guestLimit.max) throw httpError(429, "You already have too many upcoming bookings here");
    }
    if (await hasConflict(staff._id, startTime, endTime, session)) return null;
    const [created] = await Appointment.create([{ ...fields, staffId: staff._id, startTime, endTime }], { session });
    return created;
  });
}

// "Any staff member": try the people who do the service, the least busy that day first, each
// under their own lock - so two customers booking "anyone" at the same moment get two
// different people (or one gets 409 when nobody is left), never the same person twice.
async function bookAnyone({ tenant, service, date, time, fields, guestLimit }) {
  const { startTime, endTime } = checkBusinessTime({ tenant, date, time, duration: service.duration });

  const people = (await peopleForService(tenant, service)).filter((p) =>
    worksAt(tenant, p, date, time, service.duration),
  );
  if (!people.length) throw httpError(409, NOBODY_FREE);

  const dayStart = localToDate(date, "00:00", tenant.timezone);
  const dayEnd = localToDate(nextDate(date), "00:00", tenant.timezone);
  const counts = await Appointment.aggregate([
    {
      $match: {
        staffId: { $in: people.map((p) => p._id) },
        status: { $in: ACTIVE_STATUSES },
        startTime: { $gte: dayStart, $lt: dayEnd },
      },
    },
    { $group: { _id: "$staffId", n: { $sum: 1 } } },
  ]);
  const load = new Map(counts.map((c) => [String(c._id), c.n]));
  // Stable sort: equal load keeps the alphabetical order from peopleForService.
  people.sort((a, b) => (load.get(String(a._id)) ?? 0) - (load.get(String(b._id)) ?? 0));

  for (const staff of people) {
    const appointment = await insertWithLock(staff, startTime, endTime, fields, guestLimit);
    if (appointment) return { appointment, staff };
  }
  throw httpError(409, NOBODY_FREE);
}

async function bookAppointment({
  slug,
  serviceId,
  staffId,
  date,
  time,
  notes,
  customerId,
  guest,
  manageTokenHash,
  status = "pending",
  createdBy,
  maxGuestUpcoming, // public guest bookings only: max upcoming bookings per phone at this business
  whatsappConsent = false,
}) {
  if (!slug || !serviceId || !staffId || !date || !time) {
    throw httpError(400, "slug, serviceId, staffId, date and time are required");
  }

  const tenant = await Tenant.findOne({ slug: String(slug).toLowerCase(), isActive: true });
  if (!tenant) throw httpError(404, "Business not found");

  const service = await Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true });
  if (!service) throw httpError(404, "Service not found");

  const fields = {
    tenantId: tenant._id,
    ...(customerId ? { customerId } : { guest, manageTokenHash }),
    serviceId: service._id,
    serviceName: service.name,
    price: service.price,
    duration: service.duration,
    notes,
    status,
    createdBy,
    whatsappConsent: whatsappConsent === true,
  };
  const guestLimit =
    maxGuestUpcoming && guest?.phone ? { tenantId: tenant._id, phone: guest.phone, max: maxGuestUpcoming } : null;

  if (staffId === ANY_STAFF) {
    const { appointment, staff } = await bookAnyone({ tenant, service, date, time, fields, guestLimit });
    return { appointment, tenant, service, staff };
  }

  const staff = await User.findOne(bookableFilter(tenant._id, { _id: staffId }));
  if (!staff) throw httpError(404, "Staff member not found");
  if (!offersService(staff, service._id)) throw httpError(400, "This staff member doesn't offer this service");

  const { startTime, endTime } = checkTime({ tenant, staff, date, time, duration: service.duration });
  const appointment = await insertWithLock(staff, startTime, endTime, fields, guestLimit);

  if (!appointment) throw httpError(409, "This staff member is already booked at that time");
  return { appointment, tenant, service, staff };
}

// Moves an upcoming appointment to a new time (and optionally another staff member).
// Same rules as a new booking; the appointment's own old slot doesn't count as a clash.
async function rescheduleAppointment({ appointment, tenant, staffId, date, time, by }) {
  const staff = await User.findOne(bookableFilter(tenant._id, { _id: staffId }));
  if (!staff) throw httpError(404, "Staff member not found");
  if (!offersService(staff, appointment.serviceId)) {
    throw httpError(400, "This staff member doesn't offer this service");
  }

  const { startTime, endTime } = checkTime({ tenant, staff, date, time, duration: appointment.duration });
  if (startTime.getTime() === appointment.startTime.getTime() && staff._id.equals(appointment.staffId)) {
    throw httpError(400, "This is already the appointment's time");
  }

  const updated = await withStaffLock(staff._id, async (session) => {
    if (await hasConflict(staff._id, startTime, endTime, session, appointment._id)) return "taken";
    // Only if nobody changed it meanwhile (still active, still at the old time).
    return Appointment.findOneAndUpdate(
      { _id: appointment._id, status: { $in: ACTIVE_STATUSES }, startTime: appointment.startTime },
      {
        $set: {
          startTime,
          endTime,
          staffId: staff._id,
          rescheduled: { from: appointment.startTime, at: new Date(), by },
        },
        // The reminder was for the old time: the new one gets its own, with fresh retries.
        $unset: { reminderSentAt: 1, reminderChannel: 1, autoReminder: 1 },
      },
      { returnDocument: "after", runValidators: true, session },
    );
  });

  if (updated === "taken") throw httpError(409, "This staff member is already booked at that time");
  if (!updated) throw httpError(409, "This appointment was changed by someone else, please reload");
  return updated;
}

// Free start times for one staff member, one service, one day (every SLOT_STEP minutes).
// excludeId: an appointment to ignore, so rescheduling can reuse or overlap its own old slot.
async function findFreeSlots({ tenant, service, staff, date, excludeId }) {
  if (!offersService(staff, service._id)) throw httpError(400, "This staff member doesn't offer this service");
  const day = staffDayHours(tenant, staff, date);
  if (!day.isOpen) return { isOpen: false, slots: [] };

  const openMin = toMinutes(day.open);
  const closeMin = toMinutes(day.close);
  const dayOpen = localToDate(date, day.open, tenant.timezone);
  const dayClose = localToDate(date, day.close, tenant.timezone);

  const booked = await Appointment.find({
    staffId: staff._id,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: dayClose },
    endTime: { $gt: dayOpen },
    ...(excludeId && { _id: { $ne: excludeId } }),
  }).select("startTime endTime");

  const busy = booked.map((a) => ({
    start: openMin + (a.startTime - dayOpen) / 60000,
    end: openMin + (a.endTime - dayOpen) / 60000,
  }));

  const now = new Date();
  const slots = [];
  for (let start = openMin; start + service.duration <= closeMin; start += SLOT_STEP) {
    const end = start + service.duration;
    if (localToDate(date, toHHMM(start), tenant.timezone) <= now) continue;
    if (busy.some((b) => isOverlapping(start, end, b.start, b.end))) continue;
    slots.push(toHHMM(start));
  }
  return { isOpen: true, slots };
}

// "Any staff member": every time at which at least one person who does the service is free.
async function findFreeSlotsAny({ tenant, service, date }) {
  const people = await peopleForService(tenant, service);
  const results = await Promise.all(people.map((staff) => findFreeSlots({ tenant, service, staff, date })));
  return {
    isOpen: results.some((r) => r.isOpen),
    slots: [...new Set(results.flatMap((r) => r.slots))].sort(), // "HH:mm" sorts as text
  };
}

module.exports = {
  bookAppointment,
  rescheduleAppointment,
  findFreeSlots,
  findFreeSlotsAny,
  ANY_STAFF,
  httpError,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
};
