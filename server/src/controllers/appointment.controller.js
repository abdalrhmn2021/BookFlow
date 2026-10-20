const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const CustomerTenant = require("../models/CustomerTenant");
const { isValidDate, localToDate, nextDate } = require("../utils/time");
const {
  bookAppointment,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
} = require("../services/booking.service");

const WHEN_VALUES = ["upcoming", "past"];

exports.createAppointment = async (req, res) => {
  const { slug, serviceId, staffId, date, time, notes } = req.body || {};

  const { appointment, tenant } = await bookAppointment({
    slug,
    serviceId,
    staffId,
    date,
    time,
    notes,
    customerId: req.user.id,
  });

  await CustomerTenant.updateOne(
    { userId: req.user.id, tenantId: tenant._id },
    { $setOnInsert: { userId: req.user.id, tenantId: tenant._id } },
    { upsert: true },
  );

  res.status(201).json({ appointment });
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

  const filter = { customerId: req.user.id };

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

  const appointment = await Appointment.findOne({
    _id: req.params.id,
    customerId: req.user.id,
  });

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
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no-show", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

exports.getBusinessAppointments = async (req, res) => {
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

exports.markReminded = async (req, res) => {
  const updated = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      ...businessFilter(req.user, req.tenantId),
      status: { $in: ACTIVE_STATUSES },
      startTime: { $gt: new Date() },
    },
    { $set: { reminderSentAt: new Date() } },
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
