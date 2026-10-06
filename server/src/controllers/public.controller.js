const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { SINGLE_BUSINESS_SLUG } = require("../config/mode");
const {
  isValidDate,
  dayNameOf,
  localToDate,
  toMinutes,
  toHHMM,
  isOverlapping,
} = require("../utils/time");

// Only these statuses block the staff member's time (same list as appointment.controller)
const ACTIVE_STATUSES = ["pending", "confirmed"];

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
