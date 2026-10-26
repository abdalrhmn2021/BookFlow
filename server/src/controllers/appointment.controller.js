const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const { bookableFilter } = require("../utils/bookable");
const CustomerTenant = require("../models/CustomerTenant");
const { isValidDate, localToDate, nextDate } = require("../utils/time");
const {
  bookAppointment,
  rescheduleAppointment,
  findFreeSlots,
  httpError,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
} = require("../services/booking.service");
const { notifyNewBooking } = require("../services/notify.service");
const { createManageToken } = require("../utils/manageToken");
const { normalizePhone, PHONE_REGEX } = require("../utils/phone");
const { siteAllows } = require("../middlewares/site.middleware");
const { closeStalePending } = require("../services/maintenance.service");
const { siteUrl } = require("../utils/siteUrl");

const WHEN_VALUES = ["upcoming", "past"];

// A customer account works on every site of the server, but each site shows only its own
// business's appointments. Returns the filter to add: {} (any business) or { tenantId }.
// null = this site has no business, so nothing matches.
async function siteFilter(req) {
  if (!req.siteLocked) return {};
  if (!req.siteSlug) return null;
  const tenant = await Tenant.findOne({ slug: req.siteSlug }).select("_id").lean();
  return tenant ? { tenantId: tenant._id } : null;
}

exports.createAppointment = async (req, res) => {
  const { slug, serviceId, staffId, date, time, notes, whatsappConsent } = req.body || {};

  if (slug && !siteAllows(req, slug)) {
    return res.status(404).json({ message: "Business not found" });
  }

  const { appointment, tenant, staff } = await bookAppointment({
    slug,
    serviceId,
    staffId,
    date,
    time,
    notes,
    customerId: req.user.id,
    whatsappConsent: whatsappConsent === true,
  });

  await CustomerTenant.updateOne(
    { userId: req.user.id, tenantId: tenant._id },
    { $setOnInsert: { userId: req.user.id, tenantId: tenant._id } },
    { upsert: true },
  );

  notifyNewBooking({ tenant, appointment, staff, site: siteUrl(req) }).catch((err) =>
    console.error("[notify] new booking email failed:", err.message),
  );

  // staffName: with "any staff member" the customer only learns here who they got.
  res.status(201).json({ appointment, staffName: staff.name });
};

exports.getMyAppointments = async (req, res) => {
  const { status, when } = req.query;

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

  const scope = await siteFilter(req);
  if (!scope) return res.status(200).json({ count: 0, appointments: [] });

  const filter = { customerId: req.user.id, ...scope };

  if (status) filter.status = status;

  const now = new Date();
  if (when === "upcoming") filter.startTime = { $gte: now };
  if (when === "past") filter.startTime = { $lt: now };

  const sortOrder = when === "past" ? -1 : 1;

  const appointments = await Appointment.find(filter)
    .populate("tenantId", "name slug timezone")
    .populate("staffId", "name")
    .sort({ startTime: sortOrder });

  res.status(200).json({ count: appointments.length, appointments });
};

exports.cancelMyAppointment = async (req, res) => {
  const { reason } = req.body || {};
  const cleanReason = typeof reason === "string" ? reason.trim() : "";

  if (!cleanReason) {
    return res.status(400).json({ message: "Cancellation reason is required" });
  }
  if (cleanReason.length < MIN_REASON_LENGTH) {
    return res.status(400).json({
      message: `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`,
    });
  }

  const scope = await siteFilter(req);
  const appointment =
    scope &&
    (await Appointment.findOne({
      _id: req.params.id,
      customerId: req.user.id,
      ...scope,
    }));

  if (!appointment) {
    return res.status(404).json({ message: "Appointment not found" });
  }

  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    return res.status(409).json({
      message: `Can't cancel an appointment that is ${appointment.status}`,
    });
  }

  const timeLeft = appointment.startTime - Date.now();
  if (timeLeft < CUSTOMER_CANCEL_LIMIT_MS) {
    return res.status(400).json({
      message: "You can't cancel less than 2 hours before the appointment",
    });
  }

  const updated = await Appointment.findOneAndUpdate(
    {
      _id: appointment._id,
      customerId: req.user.id,
      status: { $in: ACTIVE_STATUSES },
    },
    {
      $set: {
        status: "cancelled",
        cancellation: {
          reason: cleanReason,
          cancelledBy: req.user.id,
          cancelledAt: new Date(),
        },
      },
    },
    { returnDocument: "after", runValidators: true },
  );

  if (!updated) {
    return res.status(409).json({
      message: "This appointment was changed by someone else, please reload",
    });
  }

  res.status(200).json({ message: "Appointment cancelled", appointment: updated });
};

// Owners see the whole business; staff only their own appointments.
const businessFilter = (user, tenantId) => (user.role === "staff" ? { tenantId, staffId: user.id } : { tenantId });

// completed / cancelled / no-show are final.
const ALLOWED_TRANSITIONS = {
  // A booking nobody confirmed can still be closed once it started (completed / no-show);
  // if nobody does, services/maintenance.service.js cancels it automatically a day later.
  pending: ["confirmed", "cancelled", "completed", "no-show"],
  confirmed: ["completed", "no-show", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

exports.getBusinessAppointments = async (req, res) => {
  await closeStalePending({ tenantId: req.tenantId }); // also works when the hourly timer can't (sleeping server)
  const { status } = req.query;

  if (status && !Appointment.STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${Appointment.STATUSES.join(", ")}`,
    });
  }

  const tenant = await Tenant.findById(req.tenantId).select("timezone");
  const date = req.query.date || new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(new Date());

  if (!isValidDate(date)) {
    return res.status(400).json({ message: "date must be a real date in YYYY-MM-DD format" });
  }

  // Day boundaries in the business's timezone, not the server's.
  const dayStart = localToDate(date, "00:00", tenant.timezone);
  const dayEnd = localToDate(nextDate(date), "00:00", tenant.timezone);

  const filter = {
    ...businessFilter(req.user, req.tenantId),
    startTime: { $gte: dayStart, $lt: dayEnd },
  };
  if (status) filter.status = status;

  const appointments = await Appointment.find(filter)
    .populate("customerId", "name phone email")
    .populate("staffId", "name")
    .sort({ startTime: 1 });

  res.status(200).json({ date, count: appointments.length, appointments });
};

const OVERVIEW_DAYS = 7;

// Everything the dashboard Overview needs, in one request.
exports.getBusinessStats = async (req, res) => {
  await closeStalePending({ tenantId: req.tenantId });
  const tenant = await Tenant.findById(req.tenantId).select("timezone");
  const tz = tenant.timezone;
  const now = new Date();
  const base = businessFilter(req.user, req.tenantId);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const days = [today];
  while (days.length < OVERVIEW_DAYS) days.push(nextDate(days[days.length - 1]));

  const rangeStart = localToDate(today, "00:00", tz);
  const rangeEnd = localToDate(nextDate(days[days.length - 1]), "00:00", tz);

  const [inRange, toConfirm, next] = await Promise.all([
    Appointment.find({ ...base, startTime: { $gte: rangeStart, $lt: rangeEnd } })
      .select("startTime status price")
      .lean(),
    Appointment.countDocuments({ ...base, status: "pending", startTime: { $gt: now } }),
    Appointment.findOne({ ...base, status: { $in: ACTIVE_STATUSES }, startTime: { $gt: now } })
      .sort({ startTime: 1 })
      .populate("customerId", "name phone")
      .populate("staffId", "name"),
  ]);

  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const week = days.map((date) => ({ date, count: 0 }));
  const byStatus = Object.fromEntries(Appointment.STATUSES.map((s) => [s, 0]));
  let revenue = 0;

  for (const a of inRange) {
    const date = localDay.format(a.startTime);
    const active = a.status !== "cancelled" && a.status !== "no-show";
    if (active) {
      const day = week.find((d) => d.date === date);
      if (day) day.count += 1;
    }
    if (date === today) {
      byStatus[a.status] += 1;
      if (active) revenue += a.price;
    }
  }

  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

  res.status(200).json({
    date: today,
    today: { total, byStatus, revenue },
    week,
    toConfirm,
    next,
  });
};

const UPCOMING_DAYS = 60;
const UPCOMING_LIST_LIMIT = 10;

// The schedule shows one day at a time. This tells it which days ahead have bookings and lists
// the next few, so a booking made for next week isn't hidden behind today's empty day.
exports.getUpcomingBusinessAppointments = async (req, res) => {
  await closeStalePending({ tenantId: req.tenantId });
  const tenant = await Tenant.findById(req.tenantId).select("timezone");
  const now = new Date();
  const filter = {
    ...businessFilter(req.user, req.tenantId),
    status: { $in: ACTIVE_STATUSES },
    startTime: { $gt: now, $lt: new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000) },
  };

  const [appointments, all] = await Promise.all([
    Appointment.find(filter)
      .sort({ startTime: 1 })
      .limit(UPCOMING_LIST_LIMIT)
      .select("serviceName startTime endTime status guest customerId staffId")
      .populate("customerId", "name phone")
      .populate("staffId", "name"),
    Appointment.find(filter).select("startTime").lean(),
  ]);

  // Counted per day in the business's time zone, not the server's.
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone });
  const counts = new Map();
  for (const a of all) {
    const date = localDay.format(a.startTime);
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  const days = [...counts].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

  res.status(200).json({ total: all.length, days, appointments });
};

const NEW_BOOKINGS_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const NEW_BOOKINGS_LIMIT = 20;

// The dashboard polls this to alert on bookings made since its last look.
// Without `since` it only returns the server's clock, which the dashboard keeps as its first
// bookmark - using the server's time (not the browser's) means a wrong phone clock can't skip bookings.
exports.getNewBusinessAppointments = async (req, res) => {
  const now = new Date();
  if (!req.query.since) return res.status(200).json({ now, appointments: [] });

  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return res.status(400).json({ message: "since must be a date" });
  }

  // A laptop that slept for days shouldn't get a flood of old alerts.
  const from = new Date(Math.max(since.getTime(), now.getTime() - NEW_BOOKINGS_LOOKBACK_MS));

  const appointments = await Appointment.find({
    ...businessFilter(req.user, req.tenantId),
    createdAt: { $gt: from, $lte: now },
    createdBy: { $ne: req.user.id }, // no alert for a booking you just entered yourself
  })
    .sort({ createdAt: 1 })
    .limit(NEW_BOOKINGS_LIMIT)
    .select("serviceName startTime status guest customerId staffId createdAt")
    .populate("customerId", "name phone")
    .populate("staffId", "name");

  res.status(200).json({ now, appointments });
};

exports.markReminded = async (req, res) => {
  const updated = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      ...businessFilter(req.user, req.tenantId),
      status: { $in: ACTIVE_STATUSES },
      startTime: { $gt: new Date() },
    },
    { $set: { reminderSentAt: new Date(), reminderChannel: "manual" } },
    { returnDocument: "after" },
  );

  if (!updated) {
    const exists = await Appointment.exists({ _id: req.params.id, ...businessFilter(req.user, req.tenantId) });
    if (!exists) return res.status(404).json({ message: "Appointment not found" });
    return res.status(409).json({ message: "Only upcoming active appointments can be reminded" });
  }

  res.status(200).json({ reminderSentAt: updated.reminderSentAt });
};

exports.updateAppointmentStatus = async (req, res) => {
  const { status, reason } = req.body || {};

  if (!status || !Appointment.STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${Appointment.STATUSES.join(", ")}`,
    });
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (status === "cancelled") {
    if (!cleanReason) {
      return res.status(400).json({ message: "Cancellation reason is required" });
    }
    if (cleanReason.length < MIN_REASON_LENGTH) {
      return res.status(400).json({
        message: `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`,
      });
    }
  }

  const appointment = await Appointment.findOne({
    _id: req.params.id,
    ...businessFilter(req.user, req.tenantId),
  });
  if (!appointment) return res.status(404).json({ message: "Appointment not found" });

  const current = appointment.status;
  if (!ALLOWED_TRANSITIONS[current].includes(status)) {
    return res.status(409).json({ message: `Can't change status from ${current} to ${status}` });
  }

  const hasStarted = appointment.startTime <= new Date();
  if ((status === "completed" || status === "no-show") && !hasStarted) {
    return res.status(400).json({
      message: `Can't mark as ${status} before the appointment starts`,
    });
  }
  if ((status === "confirmed" || status === "cancelled") && hasStarted) {
    return res.status(400).json({
      message: `Can't mark as ${status} after the appointment started`,
    });
  }

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

  res.status(200).json({ message: `Appointment ${status}`, appointment: updated });
};

// ---------- Bookings entered and moved by the business (dashboard) ----------

// Staff work on their own calendar only; owners on anyone's.
function staffFor(req, requested) {
  if (req.user.role !== "staff") return requested;
  if (requested && String(requested) !== String(req.user.id)) {
    throw httpError(403, "Staff can only manage their own bookings");
  }
  return req.user.id;
}

// A walk-in or phone booking. Confirmed right away (the business made it), with a manage link
// the business can send to the customer on WhatsApp.
exports.createBusinessAppointment = async (req, res) => {
  const { serviceId, staffId, date, time, notes, name, phone, whatsappConsent } = req.body || {};

  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName.length < 2) throw httpError(400, "Name must be at least 2 characters");
  if (cleanName.length > 60) throw httpError(400, "Name is too long");

  const cleanPhone = normalizePhone(phone);
  if (cleanPhone && !PHONE_REGEX.test(cleanPhone)) throw httpError(400, "Please provide a valid phone number");

  const tenant = await Tenant.findById(req.tenantId).select("slug");
  const { token, hash } = createManageToken();

  const { appointment } = await bookAppointment({
    slug: tenant.slug,
    serviceId,
    staffId: staffFor(req, staffId),
    date,
    time,
    notes,
    guest: { name: cleanName, ...(cleanPhone && { phone: cleanPhone }) },
    manageTokenHash: hash,
    status: "confirmed",
    createdBy: req.user.id,
    // A phone / walk-in customer can agree out loud; the business ticks it for them.
    whatsappConsent: whatsappConsent === true,
  });

  await appointment.populate("staffId", "name");
  res.status(201).json({ appointment, manageToken: token });
};

exports.rescheduleBusinessAppointment = async (req, res) => {
  const { date, time, staffId } = req.body || {};

  const appointment = await Appointment.findOne({ _id: req.params.id, ...businessFilter(req.user, req.tenantId) });
  if (!appointment) return res.status(404).json({ message: "Appointment not found" });

  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    return res.status(409).json({ message: `Can't reschedule an appointment that is ${appointment.status}` });
  }
  if (appointment.startTime <= new Date()) {
    return res.status(400).json({ message: "Can't reschedule an appointment that already started" });
  }

  const tenant = await Tenant.findById(req.tenantId);
  const updated = await rescheduleAppointment({
    appointment,
    tenant,
    staffId: staffFor(req, staffId) || appointment.staffId,
    date,
    time,
    by: req.user.id,
  });

  await updated.populate([
    { path: "customerId", select: "name phone email" },
    { path: "staffId", select: "name" },
  ]);
  res.status(200).json({ message: "Appointment rescheduled", appointment: updated });
};

// Free times for the dashboard's booking / reschedule form. `exclude` = the appointment being
// moved, so its own current slot counts as free.
exports.getBusinessAvailability = async (req, res) => {
  const { serviceId, date, exclude } = req.query;
  const staffId = staffFor(req, req.query.staffId);

  if (!serviceId || !staffId || !date) {
    return res.status(400).json({ message: "serviceId, staffId and date are required" });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "date must be a real date in YYYY-MM-DD format" });
  }
  if (exclude && !mongoose.isValidObjectId(exclude)) {
    return res.status(400).json({ message: "Invalid exclude" });
  }

  const tenant = await Tenant.findById(req.tenantId);
  // A service can be inactive and still have bookings being moved, so it isn't filtered by isActive.
  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id }),
    User.findOne(bookableFilter(tenant._id, { _id: staffId })),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  const { isOpen, slots } = await findFreeSlots({ tenant, service, staff, date, excludeId: exclude });
  res.status(200).json({ date, isOpen, slots });
};
