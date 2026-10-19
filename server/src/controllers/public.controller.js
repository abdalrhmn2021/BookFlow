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
const {
  isValidDate,
  dayNameOf,
  localToDate,
  toMinutes,
  toHHMM,
  isOverlapping,
} = require("../utils/time");

// Slots are offered every 15 minutes: 09:00, 09:15, 09:30 ...
const SLOT_STEP = 15;

// ============================================================
// PUBLIC routes - no login needed.
// A customer has to see a business's services and staff BEFORE booking,
// otherwise they can never know which serviceId / staffId to send.
//
// Rule for everything public: return the MINIMUM the customer needs.
// Anything else (emails, phones, plan, isActive flags...) stays private.
// ============================================================

// @route  GET /api/public/businesses
// @access Public
// A simple directory, so a customer can find where to book.
exports.listBusinesses = async (req, res) => {
  // Same rules as the business page: active businesses only, minimum fields only.
  // limit(): never send an unlimited list - with 10,000 businesses this would be huge.
  // (A real directory would add pagination + search; 50 is enough for now.)
  // وضع البزنس الواحد: القائمة بتعرض بزنسنا بس (حماية إضافية حتى لو انضاف بزنس للداتابيس بطريقة ثانية)
  const filter = { isActive: true };
  if (SINGLE_BUSINESS_SLUG) filter.slug = SINGLE_BUSINESS_SLUG;

  const tenants = await Tenant.find(filter).select("name slug").sort({ name: 1 }).limit(50);

  res.status(200).json({
    businesses: tenants.map((t) => ({ name: t.name, slug: t.slug })),
  });
};


// @route  GET /api/public/businesses/:slug
// @access Public
exports.getBusinessBySlug = async (req, res) => {
  // 1) Only ACTIVE businesses are visible. A business disabled by the admin
  //    looks exactly like one that doesn't exist -> 404.
  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  // 2) Services and staff of THIS business only, both queries at the same time.
  //    isActive: true -> the customer never sees something they can't book
  //    (createAppointment would reject it anyway).
  //    .select() asks MongoDB for the needed fields only.
  const [services, staff] = await Promise.all([
    Service.find({ tenantId: tenant._id, isActive: true })
      .select("name description price duration")
      .sort({ name: 1 }),
    User.find({ tenantId: tenant._id, role: "staff", isActive: true })
      .select("name")
      .sort({ name: 1 }),
  ]);

  // 3) Build the response by hand (DTO) - never send whole documents to the public
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
    // staff: id + name ONLY. Their email/phone are private data -
    // publishing them would hand every employee's contact info to spammers.
    staff: staff.map((u) => ({ id: u._id, name: u.name })),
  });
};


// @route  GET /api/public/businesses/:slug/availability?serviceId=...&staffId=...&date=2026-10-03
// @access Public
// Returns the start times ("HH:mm") at which this staff member can do this service on that day.
exports.getAvailability = async (req, res) => {
  const { serviceId, staffId, date } = req.query;

  // 0) Input checks
  if (!serviceId || !staffId || !date) {
    return res.status(400).json({ message: "serviceId, staffId and date are required" });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "date must be a real date in YYYY-MM-DD format" });
  }

  // 1) Business, service and staff - exactly the same checks as createAppointment.
  //    If availability says "free" but booking says "not found", the customer gets confused.
  const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  const [service, staff] = await Promise.all([
    Service.findOne({ _id: serviceId, tenantId: tenant._id, isActive: true }),
    User.findOne({ _id: staffId, tenantId: tenant._id, role: "staff", isActive: true }),
  ]);
  if (!service) return res.status(404).json({ message: "Service not found" });
  if (!staff) return res.status(404).json({ message: "Staff member not found" });

  // 2) Is the business open that day? Closed -> not an error, just no slots.
  const day = tenant.workingHours.find((d) => d.day === dayNameOf(date));
  if (!day || !day.isOpen) {
    return res.status(200).json({ date, isOpen: false, slots: [] });
  }

  const openMin = toMinutes(day.open); //   "09:00" -> 540
  const closeMin = toMinutes(day.close); // "17:00" -> 1020

  // 3) ONE query for all of the staff member's active appointments that touch
  //    today's opening hours (not one query per slot - that would be ~30 queries!).
  const dayOpen = localToDate(date, day.open, tenant.timezone); //  real UTC moment of opening
  const dayClose = localToDate(date, day.close, tenant.timezone);

  const booked = await Appointment.find({
    staffId: staff._id,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: dayClose }, // same overlap rule as the booking check
    endTime: { $gt: dayOpen },
  }).select("startTime endTime");

  // 4) Convert each appointment to "minutes since midnight" in the business's local time,
  //    so we can compare it with the slots using plain numbers.
  //    (minutes after opening) + openMin  ->  e.g. 60 min after 09:00 = 600 (10:00)
  const busy = booked.map((a) => ({
    start: openMin + (a.startTime - dayOpen) / 60000,
    end: openMin + (a.endTime - dayOpen) / 60000,
  }));

  // 5) Walk the day in 15-minute steps and keep the slots that are really bookable
  const now = new Date();
  const slots = [];

  for (let start = openMin; start + service.duration <= closeMin; start += SLOT_STEP) {
    const end = start + service.duration;

    // a) Not in the past (today's morning slots disappear as the day goes on)
    if (localToDate(date, toHHMM(start), tenant.timezone) <= now) continue;

    // b) Doesn't overlap ANY existing appointment - your isOverlapping()
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


// ============================================================
// GUEST BOOKING - book without creating an account
// ============================================================
// زبون الحلاق بدّه يحط اسمه ورقمه ويحجز بس - إجباره يعمل حساب بيخسّر حجوزات.
// القواعد كلها نفس حجز الزبون المسجّل (bookAppointment)، الفرق بس بـ "مين حجز".

// A guest can hold at most this many UPCOMING active bookings per business.
// Stops one person (or a bot) from filling a whole day with fake bookings.
const MAX_GUEST_UPCOMING = 3;

// "٠٥٩٩ ١٢٣-٤٥٦" -> "0599123456"
// - Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) become 0-9: an Arabic keyboard types those
// - spaces, dashes, dots and brackets are dropped
// - a leading "00" becomes "+" (00970... and +970... are the same number)
function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  let phone = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  return phone;
}
// optional "+", then 7 to 15 digits (15 = the international maximum, E.164)
const PHONE_REGEX = /^\+?\d{7,15}$/;

// @route  POST /api/public/businesses/:slug/appointments
// @access Public (rate limited - see public.routes.js)
// Body: { serviceId, staffId, date, time, notes?, name, phone }
exports.createGuestAppointment = async (req, res) => {
  const { serviceId, staffId, date, time, notes, name, phone } = req.body || {};

  // 1) Who is booking? (typeof checks: never trust that the body sends strings)
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

  // 2) Anti-spam: how many upcoming bookings does this phone already hold HERE?
  //    (checked before booking, so a spammer never even reaches the lock)
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

  // 3) The secret "manage my booking" link. Only its HASH is saved with the booking;
  //    the token itself goes back to the guest in this answer - and nowhere else.
  const { token: manageToken, hash: manageTokenHash } = createManageToken();

  // 4) Same booking core as logged-in customers (hours, past, double-booking lock...)
  const { appointment, staff } = await bookAppointment({
    slug: req.params.slug, // from the URL - the page the guest is on
    serviceId,
    staffId,
    date,
    time,
    notes,
    guest: { name: cleanName, phone: cleanPhone },
    manageTokenHash,
  });

  // 5) A public endpoint answers with the minimum (DTO) - no ids of other people.
  //    manageToken: shown to the guest ONCE (we can't show it again - we only kept the hash).
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

// ============================================================
// GUEST "MANAGE MY BOOKING" - view / cancel with the secret link
// ============================================================
// اللي معه الرابط /booking/<token> = صاحب الحجز. ما في login.
// Any wrong, broken or old token -> the same 404, so a guesser learns nothing.

// Find the booking that belongs to this link (or throw 404)
async function findByToken(token) {
  if (!TOKEN_REGEX.test(token)) throw httpError(404, "Booking not found"); // don't even hit the DB
  const appointment = await Appointment.findOne({ manageTokenHash: hashToken(token) })
    .populate("tenantId", "name slug timezone")
    .populate("staffId", "name");
  if (!appointment) throw httpError(404, "Booking not found");
  return appointment;
}

// The page shows this - built by hand (DTO): no ids, no hash, phone masked
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
    // The page asks the server "can I cancel?" instead of re-calculating the rules itself
    canCancel: ACTIVE_STATUSES.includes(a.status) && cancelDeadline > new Date(),
    cancelDeadline,
    cancellation:
      a.status === "cancelled" && a.cancellation
        ? { reason: a.cancellation.reason, cancelledAt: a.cancellation.cancelledAt, byGuest: Boolean(a.cancellation.byGuest) }
        : null,
  };
}

// @route  GET /api/public/bookings/:token
// @access Public - whoever has the link (rate limited)
exports.getGuestBooking = async (req, res) => {
  const appointment = await findByToken(req.params.token);
  res.status(200).json({ booking: toGuestBookingDTO(appointment) });
};

// @route  PATCH /api/public/bookings/:token/cancel
// @access Public - whoever has the link (rate limited)
// Body: { reason }  - exactly the same rules as a logged-in customer
exports.cancelGuestBooking = async (req, res) => {
  // 0) A real reason, as a string (an object/array/number must be a 400, not a 500)
  const { reason } = req.body || {};
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanReason) throw httpError(400, "Cancellation reason is required");
  if (cleanReason.length < MIN_REASON_LENGTH) {
    throw httpError(400, `Cancellation reason must be at least ${MIN_REASON_LENGTH} characters long`);
  }

  // 1) Which booking? (404 for anything wrong)
  const appointment = await findByToken(req.params.token);

  // 2) Still active?
  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    throw httpError(409, `Can't cancel an appointment that is ${appointment.status}`);
  }

  // 3) Not less than 2 hours before (also covers started / past appointments)
  if (appointment.startTime - Date.now() < CUSTOMER_CANCEL_LIMIT_MS) {
    throw httpError(400, "You can't cancel less than 2 hours before the appointment");
  }

  // 4) Atomic "check + write": cancel ONLY if it is still active right now.
  //    The owner may have confirmed or cancelled it between step 1 and here.
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

// exported for the tests
exports.normalizePhone = normalizePhone;
