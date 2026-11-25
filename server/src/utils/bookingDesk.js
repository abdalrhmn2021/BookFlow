// ============================================================
// Who handles a business's bookings (the "booking desk").
//
//   receptionist -> always: confirms, rejects, enters, moves and cancels bookings, sends reminders.
//   owner        -> only while the business has NO active receptionist (a barber who works alone).
//                   With a receptionist, the owner just watches (overview + full schedule) and
//                   manages the team, services and hours.
//   staff        -> never. They see their own schedule and close their own appointments once
//                   they started (completed / no-show).
//
// Deactivating the last receptionist gives the desk back to the owner automatically.
// ============================================================
const User = require("../models/User");

// Everyone who works in a business's dashboard (login, /tenants/me, the schedule...).
const BUSINESS_ROLES = ["owner", "staff", "receptionist"];
// The accounts an owner adds from the Staff tab.
const TEAM_ROLES = ["staff", "receptionist"];
// What someone who isn't the desk can still do, on their OWN appointments only.
const PROVIDER_STATUSES = ["completed", "no-show"];

const DESK_ONLY = "You don't have permission to manage bookings";

async function hasReceptionist(tenantId) {
  return Boolean(await User.exists({ tenantId, role: "receptionist", isActive: true }));
}

async function canManageBookings(user, tenantId) {
  if (user.role === "receptionist") return true;
  if (user.role === "owner") return !(await hasReceptionist(tenantId));
  return false;
}

// Route guard for the desk-only actions (new booking, move, reminder, free times).
async function requireBookingDesk(req, res, next) {
  if (await canManageBookings(req.user, req.tenantId)) return next();
  return res.status(403).json({ message: DESK_ONLY });
}

module.exports = {
  BUSINESS_ROLES,
  TEAM_ROLES,
  PROVIDER_STATUSES,
  DESK_ONLY,
  hasReceptionist,
  canManageBookings,
  requireBookingDesk,
};
