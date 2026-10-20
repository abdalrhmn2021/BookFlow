const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { SINGLE_BUSINESS_SLUG } = require("../config/mode");
const {
  bookAppointment,
  httpError,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
} = require("../services/booking.service");
const { TOKEN_REGEX, hashToken, createManageToken, maskPhone } = require("../utils/manageToken");
const { isValidDate, dayNameOf, localToDate, toMinutes, toHHMM, isOverlapping } = require("../utils/time");

const SLOT_STEP = 15;

exports.listBusinesses = async (req, res) => {
  const filter = { isActive: true };
  if (SINGLE_BUSINESS_SLUG) filter.slug = SINGLE_BUSINESS_SLUG;

  const tenants = await Tenant.find(filter).select("name slug").sort({ name: 1 }).limit(50);

  res.status(200).json({
    businesses: tenants.map((t) => ({ name: t.name, slug: t.slug })),
  });
};

exports.getBusinessBySlug = async (req, res) => {
  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  const [services, staff] = await Promise.all([
    Service.find({ tenantId: tenant._id, isActive: true }).select("name description price duration").sort({ name: 1 }),
    User.find({ tenantId: tenant._id, role: "staff", isActive: true }).select("name").sort({ name: 1 }),
  ]);

  res.status(200).json({
    business: {
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      workingHours: tenant.workingHours,
    },
    services: services.map((s) => ({
      id: s._id,
      name: s.name,
      description: s.description,
      price: s.price,
      duration: s.duration,
    })),
    staff: staff.map((u) => ({ id: u._id, name: u.name })),
  });
};

exports.getAvailability = async (req, res) => {
  const { serviceId, staffId, date } = req.query;

  if (!serviceId || !staffId || !date) {
    return res.status(400).json({ message: "serviceId, staffId and date are required" });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "date must be a real date in YYYY-MM-DD format" });
  }

  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne({ _id: staffId, tenantId: tenant._id, role: "staff", isActive: true }),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  const day = tenant.workingHours.find((d) => d.day === dayNameOf(date));
  if (!day || !day.isOpen) {
    return res.status(200).json({ date, isOpen: false, slots: [] });
  }

  const openMin = toMinutes(day.open);
  const closeMin = toMinutes(day.close);

  const dayOpen = localToDate(date, day.open, tenant.timezone);
  const dayClose = localToDate(date, day.close, tenant.timezone);

  const booked = await Appointment.find({
    staffId: staff._id,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: dayClose },
    endTime: { $gt: dayOpen },
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

    const clash = busy.some((b) => isOverlapping(start, end, b.start, b.end));
    if (clash) continue;

    slots.push(toHHMM(start));
  }

  res.status(200).json({
    date,
    isOpen: true,
    service: { id: service._id, name: service.name, duration: service.duration },
    staff: { id: staff._id, name: staff.name },
    slots,
  });
};

const MAX_GUEST_UPCOMING = 3;

function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  let phone = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  return phone;
}
const PHONE_REGEX = /^\+?\d{7,15}$/;

exports.createGuestAppointment = async (req, res) => {
  const { serviceId, staffId, date, time, notes, name, phone } = req.body || {};

  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName.length < 2) {
    throw httpError(400, "Name must be at least 2 characters");
  }
  if (cleanName.length > 60) {
    throw httpError(400, "Name is too long");
  }
  const cleanPhone = normalizePhone(phone);
  if (!PHONE_REGEX.test(cleanPhone)) {
    throw httpError(400, "Please provide a valid phone number");
  }

  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true }).select("_id");
  if (!tenant) throw httpError(404, "Business not found");

  const upcoming = await Appointment.countDocuments({
    tenantId: tenant._id,
    "guest.phone": cleanPhone,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $gte: new Date() },
  });
  if (upcoming >= MAX_GUEST_UPCOMING) {
    throw httpError(429, "You already have too many upcoming bookings here");
  }

  const { token: manageToken, hash: manageTokenHash } = createManageToken();

  const { appointment, staff } = await bookAppointment({
    slug: req.params.slug,
    serviceId,
    staffId,
    date,
    time,
    notes,
    guest: { name: cleanName, phone: cleanPhone },
    manageTokenHash,
  });

  res.status(201).json({
    manageToken,
    appointment: {
      id: appointment._id,
      serviceName: appointment.serviceName,
      staffName: staff.name,
      price: appointment.price,
      duration: appointment.duration,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
    },
  });
};

async function findByToken(token) {
  if (!TOKEN_REGEX.test(token)) throw httpError(404, "Booking not found");
  const appointment = await Appointment.findOne({ manageTokenHash: hashToken(token) })
    .populate("tenantId", "name slug timezone")
    .populate("staffId", "name");
  if (!appointment) throw httpError(404, "Booking not found");
  return appointment;
}

function toGuestBookingDTO(a) {
  const cancelDeadline = new Date(a.startTime.getTime() - CUSTOMER_CANCEL_LIMIT_MS);
  return {
    business: a.tenantId ? { name: a.tenantId.name, slug: a.tenantId.slug, timezone: a.tenantId.timezone } : null,
    serviceName: a.serviceName,
    staffName: a.staffId?.name ?? null,
    price: a.price,
    duration: a.duration,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    notes: a.notes,
    guestName: a.guest?.name,
    guestPhone: maskPhone(a.guest?.phone),
    canCancel: ACTIVE_STATUSES.includes(a.status) && cancelDeadline > new Date(),
    cancelDeadline,
    cancellation:
      a.status === "cancelled" && a.cancellation
        ? {
            reason: a.cancellation.reason,
            cancelledAt: a.cancellation.cancelledAt,
            byGuest: Boolean(a.cancellation.byGuest),
          }
        : null,
  };
}

exports.getGuestBooking = async (req, res) => {
  const appointment = await findByToken(req.params.token);
  res.status(200).json({ booking: toGuestBookingDTO(appointment) });
};

exports.cancelGuestBooking = async (req, res) => {
  const { reason } = req.body || {};
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanReason) throw httpError(400, "Cancellation reason is required");
  if (cleanReason.length < MIN_REASON_LENGTH) {
    throw httpError(400, `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`);
  }

  const appointment = await findByToken(req.params.token);

  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    throw httpError(409, `Can't cancel an appointment that is ${appointment.status}`);
  }

  if (appointment.startTime - Date.now() < CUSTOMER_CANCEL_LIMIT_MS) {
    throw httpError(400, "You can't cancel less than 2 hours before the appointment");
  }

  const updated = await Appointment.findOneAndUpdate(
    { _id: appointment._id, status: { $in: ACTIVE_STATUSES } },
    {
      $set: {
        status: "cancelled",
        cancellation: { reason: cleanReason, cancelledAt: new Date(), byGuest: true },
      },
    },
    { returnDocument: "after", runValidators: true },
  )
    .populate("tenantId", "name slug timezone")
    .populate("staffId", "name");

  if (!updated) {
    throw httpError(409, "This appointment was changed by someone else, please reload");
  }

  res.status(200).json({ message: "Appointment cancelled", booking: toGuestBookingDTO(updated) });
};

exports.normalizePhone = normalizePhone;
