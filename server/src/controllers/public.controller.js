const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const { bookableFilter } = require("../utils/bookable");
const Appointment = require("../models/Appointment");
const { siteAllows } = require("../middlewares/site.middleware");
const { siteUrl } = require("../utils/siteUrl");
const {
  bookAppointment,
  findFreeSlots,
  findFreeSlotsAny,
  ANY_STAFF,
  httpError,
  ACTIVE_STATUSES,
  CUSTOMER_CANCEL_LIMIT_MS,
  MIN_REASON_LENGTH,
} = require("../services/booking.service");
const { TOKEN_REGEX, hashToken, createManageToken, maskPhone } = require("../utils/manageToken");
const { notifyNewBooking } = require("../services/notify.service");
const { normalizePhone, PHONE_REGEX } = require("../utils/phone");
const { isValidDate } = require("../utils/time");
const { isAssistantConfigured, askAssistant } = require("../services/assistant.service");

exports.listBusinesses = async (req, res) => {
  // A one-business site lists only its own business. A shared server answering a request
  // that didn't come through one of our sites lists nothing (no client list for strangers).
  if (req.siteLocked && !req.siteSlug) return res.status(200).json({ businesses: [] });

  const filter = { isActive: true };
  if (req.siteLocked) filter.slug = req.siteSlug;

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
    User.find(bookableFilter(tenant._id)).select("name services").sort({ name: 1 }),
  ]);

  res.status(200).json({
    business: {
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      workingHours: tenant.workingHours,
      assistant: isAssistantConfigured() && Boolean(tenant.aiAssistant),
    },
    services: services.map((s) => ({
      id: s._id,
      name: s.name,
      description: s.description,
      price: s.price,
      duration: s.duration,
    })),
    // serviceIds: what they do - [] = every service (the booking page filters staff by it).
    staff: staff.map((u) => ({ id: u._id, name: u.name, serviceIds: u.services ?? [] })),
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

  // "Any staff member": the free times of everyone who does this service, merged.
  if (staffId === ANY_STAFF) {
    const service = await Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true });
    if (!service) return res.status(404).json({ message: "Service not found" });
    const { isOpen, slots } = await findFreeSlotsAny({ tenant, service, date });
    return res.status(200).json({
      date,
      isOpen,
      service: { id: service._id, name: service.name, duration: service.duration },
      staff: { id: ANY_STAFF, name: null },
      slots,
    });
  }

  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne(bookableFilter(tenant._id, { _id: staffId })),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  const { isOpen, slots } = await findFreeSlots({ tenant, service, staff, date });
  if (!isOpen) return res.status(200).json({ date, isOpen: false, slots: [] });

  res.status(200).json({
    date,
    isOpen: true,
    service: { id: service._id, name: service.name, duration: service.duration },
    staff: { id: staff._id, name: staff.name },
    slots,
  });
};

const ASSISTANT_MAX_MESSAGES = 12;
const ASSISTANT_MAX_LENGTH = 500;
const ASSISTANT_OFF = "The assistant isn't available for this business";

// POST /api/public/businesses/:slug/assistant  { messages: [{ role: "user" | "assistant", text }] }
// The whole (short) chat is sent each time: nothing about it is stored on the server.
exports.askBookingAssistant = async (req, res) => {
  const { messages } = req.body || {};
  const valid =
    Array.isArray(messages) &&
    messages.length >= 1 &&
    messages.length <= ASSISTANT_MAX_MESSAGES &&
    messages.every(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        m.text.trim() &&
        m.text.length <= ASSISTANT_MAX_LENGTH,
    ) &&
    messages[messages.length - 1].role === "user";
  if (!valid) {
    return res.status(400).json({
      message: `messages must be 1-${ASSISTANT_MAX_MESSAGES} messages of up to ${ASSISTANT_MAX_LENGTH} characters, the last one from the user`,
    });
  }

  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });
  if (!isAssistantConfigured() || !tenant.aiAssistant) return res.status(404).json({ message: ASSISTANT_OFF });

  try {
    const reply = await askAssistant({
      tenant,
      messages: messages.map((m) => ({ role: m.role, text: m.text.trim() })),
    });
    res.status(200).json({ reply });
  } catch (err) {
    console.error(`[assistant] ${tenant.slug}:`, err.message);
    res.status(502).json({ message: "The assistant can't answer right now, please try again" });
  }
};

const MAX_GUEST_UPCOMING = 3;

exports.createGuestAppointment = async (req, res) => {
  const { serviceId, staffId, date, time, notes, name, phone, whatsappConsent } = req.body || {};

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

  const { token: manageToken, hash: manageTokenHash } = createManageToken();

  const {
    appointment,
    staff,
    tenant: business,
  } = await bookAppointment({
    slug: req.params.slug,
    serviceId,
    staffId,
    date,
    time,
    notes,
    guest: { name: cleanName, phone: cleanPhone },
    manageTokenHash,
    // Checked inside the booking transaction, under a per-phone lock (booking.service).
    maxGuestUpcoming: MAX_GUEST_UPCOMING,
    whatsappConsent: whatsappConsent === true,
  });

  // Not awaited: the guest gets the answer now, the email goes out in the background.
  notifyNewBooking({ tenant: business, appointment, staff, site: siteUrl(req) }).catch((err) =>
    console.error("[notify] new booking email failed:", err.message),
  );

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
            auto: Boolean(a.cancellation.auto),
          }
        : null,
  };
}

// A manage link opened on another business's site is "not found" there.
async function findSiteBooking(req) {
  const appointment = await findByToken(req.params.token);
  if (!siteAllows(req, appointment.tenantId?.slug)) throw httpError(404, "Booking not found");
  return appointment;
}

exports.getGuestBooking = async (req, res) => {
  const appointment = await findSiteBooking(req);
  res.status(200).json({ booking: toGuestBookingDTO(appointment) });
};

exports.cancelGuestBooking = async (req, res) => {
  const { reason } = req.body || {};
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanReason) throw httpError(400, "Cancellation reason is required");
  if (cleanReason.length < MIN_REASON_LENGTH) {
    throw httpError(400, `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`);
  }

  const appointment = await findSiteBooking(req);

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
