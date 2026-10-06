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
  nextDate,
} = require("../utils/time");

// Only these statuses block the staff member's time.
// A cancelled / no-show appointment frees the slot again.
const ACTIVE_STATUSES = ["pending", "confirmed"];

// A customer can't cancel less than 2 hours before the appointment.
// (owner/staff have no time limit - they may need to cancel at the last minute)
const CUSTOMER_CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000; // hours * min * sec * ms

// A cancellation reason must be meaningful, not just "ok"
const MIN_REASON_LENGTH = 10;

// Allowed values for ?when= in "my appointments"
const WHEN_VALUES = ["upcoming", "past"];

// @route  POST /api/appointments
// @access customer
// Body: { slug, serviceId, staffId, date: "2026-09-25", time: "10:30", notes? }
exports.createAppointment = async (req, res) => {
  const { slug, serviceId, staffId, date, time, notes } = req.body || {};

  // 0) Basic input checks
  if (!slug || !serviceId || !staffId || !date || !time) {
    return res.status(400).json({
      message: "slug, serviceId, staffId, date and time are required",
    });
  }
  if (!isValidDate(date)) {
    return res
      .status(400)
      .json({ message: "date must be a real date in YYYY-MM-DD format" });
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
    User.findOne({
      _id: staffId,
      tenantId: tenant._id,
      role: "staff",
      isActive: true,
    }),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff)
    return res.status(404).json({ message: "Staff member not found" });

  // 4) The server calculates the end - the client never sends it
  const startTime = localToDate(date, time, tenant.timezone);
  const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

  // 5) No bookings in the past
  if (startTime <= new Date()) {
    return res
      .status(400)
      .json({ message: "You can't book a time in the past" });
  }

  // 6) Must fit completely inside the business's working hours
  if (
    !fitsInWorkingHours(
      tenant.workingHours,
      dayNameOf(date),
      time,
      service.duration,
    )
  ) {
    return res
      .status(400)
      .json({ message: "This time is outside working hours" });
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
      await StaffLock.updateOne(
        { staffId: staff._id },
        { $inc: { version: 1 } },
        { session },
      );

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
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (isTaken) {
    return res
      .status(409)
      .json({ message: "This staff member is already booked at that time" });
  }

  // First booking at this business? Link the customer to it (does nothing if already linked)
  await CustomerTenant.updateOne(
    { userId: req.user.id, tenantId: tenant._id },
    { $setOnInsert: { userId: req.user.id, tenantId: tenant._id } },
    { upsert: true },
  );

  res.status(201).json({ appointment });
};

// @route  GET /api/appointments/me?status=cancelled&when=upcoming
// @access customer
// Both query params are optional:
//   status -> one of Appointment.STATUSES
//   when   -> "upcoming" (from now on) | "past" (before now)
exports.getMyAppointments = async (req, res) => {
  const { status, when } = req.query;

  // 1) Validate the filters - a typo like ?status=canceled should be an error,
  //    not a silent empty list
  if (status && !Appointment.STATUSES.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Valid statuses are: ${Appointment.STATUSES.join(", ")}`,
    });
  }
  if (when && !WHEN_VALUES.includes(when)) {
    return res.status(400).json({
      message: `Invalid when. Valid values are: ${WHEN_VALUES.join(", ")}`,
    });
  }

  // 2) Build the filter step by step - only the customer's own appointments,
  //    plus whatever the client asked for
  const filter = { customerId: req.user.id };

  if (status) filter.status = status;

  const now = new Date();
  if (when === "upcoming") filter.startTime = { $gte: now };
  if (when === "past") filter.startTime = { $lt: now };

  // 3) Upcoming: nearest first. Past: most recent first.
  const sortOrder = when === "past" ? -1 : 1;

  // A customer can book at several businesses, so each appointment needs
  // the business name (and slug, to link back to its booking page) + the staff name.
  const appointments = await Appointment.find(filter)
    .populate("tenantId", "name slug timezone")
    .populate("staffId", "name")
    .sort({ startTime: sortOrder });

  res.status(200).json({ count: appointments.length, appointments });
};

// @route  PATCH /api/appointments/:id/cancel
// @access customer
exports.cancelMyAppointment = async (req, res) => {
  // 0) A reason is required (trim first, so "   " counts as empty)
  const { reason } = req.body || {};
  const cleanReason = reason?.trim();

  if (!cleanReason) {
    return res.status(400).json({ message: "Cancellation reason is required" });
  }
  if (cleanReason.length < MIN_REASON_LENGTH) {
    return res.status(400).json({
      message: `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`,
    });
  }

  // 1) Get the appointment - but ONLY if it belongs to this customer.
  //    Both conditions live in the query itself, so another customer's
  //    appointment simply "doesn't exist" for this user (prevents IDOR).
  const appointment = await Appointment.findOne({
    _id: req.params.id,
    customerId: req.user.id, // from the verified token, never from the body
  });

  // 404 (not 403): we don't even confirm that someone else's appointment exists
  if (!appointment) {
    return res.status(404).json({ message: "Appointment not found" });
  }

  // 2) Only pending/confirmed appointments can be cancelled.
  //    Cancelling a completed / cancelled / no-show one makes no sense.
  //    409 Conflict: the request is valid, but it conflicts with the current state.
  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    return res.status(409).json({
      message: `Can't cancel an appointment that is ${appointment.status}`,
    });
  }

  // 3) Not less than 2 hours before the start.
  //    This also covers appointments that already started or are in the past:
  //    there timeLeft is negative, so it's always below the limit.
  const timeLeft = appointment.startTime - Date.now();
  if (timeLeft < CUSTOMER_CANCEL_LIMIT_MS) {
    return res.status(400).json({
      message: "You can't cancel less than 2 hours before the appointment",
    });
  }

  // 4) الإلغاء بشكل ذرّي (atomic): نلغي فقط إذا الموعد لسا فعّال.
  //    بين الخطوة 1 وهلأ، ممكن يكون الموظف أو صاحب البزنس غيّر الموعد
  //    (مثلاً لغاه هو وكتب سببه). لو استخدمنا appointment.save()
  //    رح نكتب فوق تعديلهم بدون ما ننتبه.
  //    لما نحط الحالة جوا الفلتر، MongoDB بيعمل "تحقق + كتابة" بخطوة وحدة.
  //    و"cancelled" مش من ACTIVE_STATUSES، فالموعد بيرجع متاح لغيره.
  const updated = await Appointment.findOneAndUpdate(
    {
      _id: appointment._id,
      customerId: req.user.id, // لسا موعده هو بس (حماية من IDOR)
      status: { $in: ACTIVE_STATUSES }, // لسا pending أو confirmed
    },
    {
      // $set بيغيّر هالحقول بس، والباقي (السعر، الوقت...) ما بينلمس
      $set: {
        status: "cancelled",
        cancellation: {
          reason: cleanReason, // السبب بعد trim
          cancelledBy: req.user.id, // مين لغى (من التوكن)
          cancelledAt: new Date(), // إمتى لغى
        },
      },
    },
    // after = رجّع الموعد بعد التعديل، و runValidators = شغّل قواعد الـ Schema
    { returnDocument: "after", runValidators: true },
  );

  // null = ما في موعد طابق الفلتر = حدا غيّر الحالة بعد ما قرأناها
  // 409 لأنه الطلب سليم بس بيتعارض مع الحالة الحالية
  if (!updated) {
    return res.status(409).json({
      message: "This appointment was changed by someone else, please reload",
    });
  }

  // نرجّع updated (النسخة الجديدة) وليس appointment (القديمة)
  res
    .status(200)
    .json({ message: "Appointment cancelled", appointment: updated });
};

// ============================================================
// BUSINESS SIDE - owner and staff manage the appointments
// ============================================================

// Who can see what:
//   owner -> every appointment of HIS business
//   staff -> only appointments where HE is the staff member
// Both rules are built into the query filter itself, so a staff member can
// never read or change a colleague's appointment (it simply "doesn't exist" for him).
const businessFilter = (user, tenantId) =>
  user.role === "staff" ? { tenantId, staffId: user.id } : { tenantId };

// The status "map": from each status, where are you allowed to go?
// Anything not listed here is forbidden (e.g. completed -> pending).
// completed / cancelled / no-show are FINAL: history must not be rewritten.
const ALLOWED_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no-show", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

// @route  GET /api/appointments/business?date=2026-10-03&status=pending
// @access owner, staff
// The business's appointments for ONE day (the daily schedule). Default: today.
exports.getBusinessAppointments = async (req, res) => {
  const { status } = req.query;

  if (status && !Appointment.STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${Appointment.STATUSES.join(", ")}`,
    });
  }

  // "Today" and the day's boundaries are in the BUSINESS's local time, not the server's.
  // The server may run in UTC: at 01:00 in Hebron it's still "yesterday" in UTC.
  const tenant = await Tenant.findById(req.tenantId).select("timezone");
  const date =
    req.query.date ||
    new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(
      new Date(),
    ); // en-CA -> "YYYY-MM-DD"

  if (!isValidDate(date)) {
    return res
      .status(400)
      .json({ message: "date must be a real date in YYYY-MM-DD format" });
  }

  // [start of this day, start of next day) in local time -> converted to real UTC moments
  const dayStart = localToDate(date, "00:00", tenant.timezone);
  const dayEnd = localToDate(nextDate(date), "00:00", tenant.timezone);

  const filter = {
    ...businessFilter(req.user, req.tenantId),
    startTime: { $gte: dayStart, $lt: dayEnd },
  };
  if (status) filter.status = status;

  // populate() = "join": replace the id with the few fields we need from that document.
  // The business may see its customer's phone (to call about the booking) - but not the password etc.
  const appointments = await Appointment.find(filter)
    .populate("customerId", "name phone email")
    .populate("staffId", "name")
    .sort({ startTime: 1 });

  res.status(200).json({ date, count: appointments.length, appointments });
};

// @route  PATCH /api/appointments/:id/status
// @access owner, staff
// Body: { status: "confirmed" | "completed" | "no-show" | "cancelled" }
exports.updateAppointmentStatus = async (req, res) => {
  const { status, reason } = req.body || {};

  if (!status || !Appointment.STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${Appointment.STATUSES.join(", ")}`,
    });
  }

  // A reason is required only when cancelling (same rule as the customer side)
  const cleanReason = reason?.trim();
  if (status === "cancelled") {
    if (!cleanReason) {
      return res
        .status(400)
        .json({ message: "Cancellation reason is required" });
    }
    if (cleanReason.length < MIN_REASON_LENGTH) {
      return res.status(400).json({
        message: `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`,
      });
    }
  }

  // 1) Find it - only inside this business (and only his own, if he's staff)
  const appointment = await Appointment.findOne({
    _id: req.params.id,
    ...businessFilter(req.user, req.tenantId),
  });
  if (!appointment)
    return res.status(404).json({ message: "Appointment not found" });

  // 2) Is this move allowed by the map?
  const current = appointment.status;
  if (!ALLOWED_TRANSITIONS[current].includes(status)) {
    return res
      .status(409)
      .json({ message: `Can't change status from ${current} to ${status}` });
  }

  // 3) Time rules
  const hasStarted = appointment.startTime <= new Date();
  // You can't say "completed" or "didn't come" about something that hasn't happened yet
  if ((status === "completed" || status === "no-show") && !hasStarted) {
    return res.status(400).json({
      message: `Can't mark as ${status} before the appointment starts`,
    });
  }
  // Confirming or cancelling only makes sense BEFORE it starts
  if ((status === "confirmed" || status === "cancelled") && hasStarted) {
    return res.status(400).json({
      message: `Can't mark as ${status} after the appointment started`,
    });
  }

  // 4) Save ATOMICALLY - only if the status is STILL what we read in step 1.
  //    Between step 1 and now, the customer may have cancelled it
  //    (or the owner and staff clicked at the same moment).
  //    A plain appointment.save() would silently overwrite that change.
  //    With the status inside the filter, MongoDB does "check + write" as one step.
  //    When cancelling, also record who/why/when.
  const update = { status };
  if (status === "cancelled") {
    update.cancellation = {
      reason: cleanReason,
      cancelledBy: req.user.id,
      cancelledAt: new Date(),
    };
  }

  const updated = await Appointment.findOneAndUpdate(
    { _id: appointment._id, status: current },
    { $set: update },
    { returnDocument: "after", runValidators: true },
  );

  if (!updated) {
    return res.status(409).json({
      message: "This appointment was changed by someone else, please reload",
    });
  }

  res
    .status(200)
    .json({ message: `Appointment ${status}`, appointment: updated });
};
