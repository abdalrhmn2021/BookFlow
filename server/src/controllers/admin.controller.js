const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { ACTIVE_STATUSES } = require("../services/booking.service");
const Service = require("../models/Service");
const CustomerTenant = require("../models/CustomerTenant");

// Your panel as the seller (role "superadmin", created with `npm run create-admin`):
// every client business on this server, how much it's used, and the switches you need.

const DAY = 24 * 60 * 60 * 1000;
const PLANS = Tenant.schema.path("plan").enumValues;

const countBy = (rows) => new Map(rows.map((r) => [String(r._id), r]));

exports.listBusinesses = async (req, res) => {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);

  const [tenants, owners, staff, recent, upcoming] = await Promise.all([
    Tenant.find().sort({ createdAt: -1 }).lean(),
    User.find({ role: "owner" }).select("name email phone tenantId").lean(),
    // Everyone customers can book: active staff, plus an owner who takes bookings too.
    User.aggregate([
      { $match: { isActive: true, $or: [{ role: "staff" }, { role: "owner", bookable: true }] } },
      { $group: { _id: "$tenantId", n: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$tenantId", n: { $sum: 1 }, last: { $max: "$createdAt" } } },
    ]),
    Appointment.aggregate([
      { $match: { status: { $in: ACTIVE_STATUSES }, startTime: { $gte: now } } },
      { $group: { _id: "$tenantId", n: { $sum: 1 } } },
    ]),
  ]);

  const ownersOf = new Map();
  for (const o of owners) {
    const key = String(o.tenantId);
    if (!ownersOf.has(key)) ownersOf.set(key, []);
    ownersOf.get(key).push({ name: o.name, email: o.email, phone: o.phone });
  }
  const [staffBy, recentBy, upcomingBy] = [countBy(staff), countBy(recent), countBy(upcoming)];

  res.status(200).json({
    businesses: tenants.map((t) => {
      const id = String(t._id);
      const paidUntil = t.subscription?.paidUntil ?? null;
      return {
        id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isActive: t.isActive,
        whatsappReminders: Boolean(t.whatsappReminders),
        aiAssistant: Boolean(t.aiAssistant),
        timezone: t.timezone,
        createdAt: t.createdAt,
        paidUntil,
        overdue: Boolean(paidUntil && paidUntil < now),
        note: t.subscription?.note ?? "",
        owners: ownersOf.get(id) ?? [],
        staffCount: staffBy.get(id)?.n ?? 0,
        bookingsLast30Days: recentBy.get(id)?.n ?? 0,
        lastBookingAt: recentBy.get(id)?.last ?? null,
        upcomingBookings: upcomingBy.get(id)?.n ?? 0,
      };
    }),
    plans: PLANS,
  });
};

// PATCH /api/admin/businesses/:id
//   { isActive?, whatsappReminders?, aiAssistant?, plan?, paidUntil? (YYYY-MM-DD | null), note? }
exports.updateBusiness = async (req, res) => {
  const { isActive, whatsappReminders, aiAssistant, plan, paidUntil, note } = req.body || {};
  const $set = {};

  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return res.status(400).json({ message: "isActive must be true or false" });
    $set.isActive = isActive;
  }
  if (whatsappReminders !== undefined) {
    if (typeof whatsappReminders !== "boolean") {
      return res.status(400).json({ message: "whatsappReminders must be true or false" });
    }
    $set.whatsappReminders = whatsappReminders;
  }
  if (aiAssistant !== undefined) {
    if (typeof aiAssistant !== "boolean") return res.status(400).json({ message: "aiAssistant must be true or false" });
    $set.aiAssistant = aiAssistant;
  }
  if (plan !== undefined) {
    if (!PLANS.includes(plan)) return res.status(400).json({ message: `plan must be one of: ${PLANS.join(", ")}` });
    $set.plan = plan;
  }
  if (paidUntil !== undefined) {
    if (paidUntil === null || paidUntil === "") {
      $set["subscription.paidUntil"] = null;
    } else {
      const date =
        typeof paidUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidUntil)
          ? new Date(`${paidUntil}T23:59:59Z`)
          : null;
      if (!date || Number.isNaN(date.getTime())) {
        return res.status(400).json({ message: "paidUntil must be a date like 2026-12-31" });
      }
      $set["subscription.paidUntil"] = date;
    }
  }
  if (note !== undefined) {
    if (typeof note !== "string") return res.status(400).json({ message: "note must be text" });
    $set["subscription.note"] = note;
  }
  if (!Object.keys($set).length) return res.status(400).json({ message: "Nothing to update" });

  const tenant = await Tenant.findByIdAndUpdate(
    req.params.id,
    { $set },
    { returnDocument: "after", runValidators: true },
  );
  if (!tenant) return res.status(404).json({ message: "Business not found" });
  res.status(200).json({ message: "Saved", id: tenant._id });
};

// GET /api/admin/businesses/:id/export - everything that belongs to one business, as a JSON file:
// the business, its services, staff, customers and bookings. For handing a client their data when
// the contract ends (or when they ask). Passwords, reset tokens and booking-link hashes are left out.
exports.exportBusiness = async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) return res.status(404).json({ message: "Business not found" });

  const linked = await CustomerTenant.find({ tenantId: tenant._id }).select("userId").lean();
  const [services, people, customers, appointments] = await Promise.all([
    Service.find({ tenantId: tenant._id }).lean(),
    User.find({ tenantId: tenant._id })
      .select("name email phone role isActive bookable workingHours services daysOff createdAt")
      .lean(),
    User.find({ role: "customer", $or: [{ _id: { $in: linked.map((l) => l.userId) } }, { scope: tenant._id }] })
      .select("name email phone createdAt")
      .lean(),
    Appointment.find({ tenantId: tenant._id }).select("-manageTokenHash -autoReminder").sort({ startTime: 1 }).lean(),
  ]);

  const day = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-export-${day}.json"`);
  res.status(200).json({
    exportedAt: new Date(),
    business: {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      workingHours: tenant.workingHours,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
    },
    services,
    staff: people,
    customers,
    appointments,
  });
};
