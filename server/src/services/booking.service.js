// ============================================================
// قلب الحجز - مكان واحد بيستخدمه نوعين من الحجز:
//   1) زبون مسجّل دخول    -> POST /api/appointments                       (customerId)
//   2) ضيف بدون حساب      -> POST /api/public/businesses/:slug/appointments (guest)
//
// ليش ملف منفصل؟ لأنه كل قواعد الحجز (ساعات العمل، الماضي، منع الحجز المزدوج...)
// لازم تكون نفسها بالضبط للنوعين. لو نسخناها بمكانين، يوم ما نصلّح خطأ بواحد
// رح ننسى الثاني. هيك القاعدة مكتوبة مرة وحدة بس.
// ============================================================
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const StaffLock = require("../models/StaffLock");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
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

// ---------- Cancellation rules (customer AND guest - same rules for both) ----------
// Can't cancel less than 2 hours before the appointment.
// (owner/staff have no time limit - they may need to cancel at the last minute)
const CUSTOMER_CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000; // hours * min * sec * ms
// A cancellation reason must be meaningful, not just "ok"
const MIN_REASON_LENGTH = 10;

// خطأ "متوقع" برقم حالة HTTP. الـ errorHandler بيرجّع رسالته للعميل كما هي
// (لأنه statusCode مش 500)، فالكنترولر ما بيحتاج try/catch.
function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// @param {object} input
//   slug, serviceId, staffId, date "YYYY-MM-DD", time "HH:mm", notes?
//   customerId -> للزبون المسجّل      (واحد منهم بس، مش الاثنين)
//   guest      -> { name, phone } للضيف
//   manageTokenHash? -> للضيف بس: hash رابط "إدارة حجزي" (utils/manageToken.js)
// @returns {{ appointment, tenant, service, staff }}
async function bookAppointment({ slug, serviceId, staffId, date, time, notes, customerId, guest, manageTokenHash }) {
  // 0) Basic input checks
  if (!slug || !serviceId || !staffId || !date || !time) {
    throw httpError(400, "slug, serviceId, staffId, date and time are required");
  }
  if (!isValidDate(date)) {
    throw httpError(400, "date must be a real date in YYYY-MM-DD format");
  }
  if (!TIME_REGEX.test(time)) {
    throw httpError(400, "time must be HH:mm (e.g. 10:30)");
  }

  // 1) The business must exist and be active
  const tenant = await Tenant.findOne({ slug: String(slug).toLowerCase(), isActive: true });
  if (!tenant) throw httpError(404, "Business not found");

  // 2 + 3) Service and staff must belong to THIS business (never trust ids alone - IDOR)
  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne({ _id: staffId, tenantId: tenant._id, role: "staff", isActive: true }),
  ]);
  if (!service) throw httpError(404, "Service not found");
  if (!staff) throw httpError(404, "Staff member not found");

  // 4) The server calculates the end - the client never sends it
  const startTime = localToDate(date, time, tenant.timezone);
  const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

  // 5) No bookings in the past
  if (startTime <= new Date()) {
    throw httpError(400, "You can't book a time in the past");
  }

  // 6) Must fit completely inside the business's working hours
  if (!fitsInWorkingHours(tenant.workingHours, dayNameOf(date), time, service.duration)) {
    throw httpError(400, "This time is outside working hours");
  }

  // 7 + 8) Check that the staff member is free, then save - as ONE atomic step.
  //
  // Without this, two customers booking at the same moment can BOTH pass the check
  // before either one is saved -> double booking (a "race condition").
  // Proven by the test "10 customers book the SAME slot..." in tests/booking.test.js
  //
  // Make sure this staff member's lock document exists (outside the transaction).
  await StaffLock.updateOne(
    { staffId: staff._id },
    { $setOnInsert: { staffId: staff._id } },
    { upsert: true },
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

      // c) Save - with a snapshot of the service as it is right now.
      //    Either customerId OR guest is set (the model checks that).
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
