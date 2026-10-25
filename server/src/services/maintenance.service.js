const Appointment = require("../models/Appointment");

// Housekeeping that keeps the calendar honest.
//
// A "pending" booking that nobody confirmed and nobody closed would stay pending forever and
// keep showing up as "to confirm". PENDING_AUTO_CLOSE_HOURS (default 24) after it ENDED,
// it's cancelled automatically (cancellation.auto = true, so the screens can say why).
// Until then the business can still mark it completed or no-show by hand.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REASON = "Closed automatically: it was never confirmed";

// What a booking shows instead of a removed customer's name. Language-neutral on purpose.
const REMOVED_NAME = "—";

// How long a guest's name and phone stay on a booking after it ended (the privacy page says the
// same - keep DATA_RETENTION_MONTHS equal on the server and the client sites). Default 12 months.
const retentionMonths = () => {
  const n = Number(process.env.DATA_RETENTION_MONTHS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 12;
};

const closeAfterHours = () => {
  const n = Number(process.env.PENDING_AUTO_CLOSE_HOURS);
  return Number.isFinite(n) && n >= 1 ? n : 24;
};

// tenantId: only that business (the dashboard calls it when it loads). Returns how many.
async function closeStalePending({ tenantId, now = new Date() } = {}) {
  const result = await Appointment.updateMany(
    {
      ...(tenantId && { tenantId }),
      status: "pending",
      endTime: { $lte: new Date(now.getTime() - closeAfterHours() * HOUR) },
    },
    { $set: { status: "cancelled", cancellation: { reason: REASON, cancelledAt: now, auto: true } } },
  );
  return result.modifiedCount;
}

// Removes guests' personal details (name, phone, notes, the manage link, a cancel reason they
// wrote) from bookings that ended more than the retention period ago. Registered customers keep
// theirs until they delete their account. Returns how many bookings were cleaned.
async function removeOldGuestData({ now = new Date() } = {}) {
  const before = new Date(now.getTime() - retentionMonths() * 30 * DAY);
  const result = await Appointment.updateMany(
    { guest: { $exists: true }, personalDataRemovedAt: { $exists: false }, endTime: { $lt: before } },
    {
      $set: { "guest.name": REMOVED_NAME, personalDataRemovedAt: now },
      $unset: { "guest.phone": 1, notes: 1, manageTokenHash: 1, "cancellation.reason": 1 },
    },
  );
  return result.modifiedCount;
}

// Every hour inside the server. A sleeping server (Render free) misses runs - that's fine,
// the dashboard closes its own business's stale bookings whenever it loads.
let timer = null;
function startMaintenanceJob() {
  if (timer) return;
  const run = async () => {
    try {
      const n = await closeStalePending();
      if (n) console.log(`[maintenance] closed ${n} booking(s) nobody confirmed`);
      const cleaned = await removeOldGuestData();
      if (cleaned) console.log(`[maintenance] removed guest details from ${cleaned} old booking(s)`);
    } catch (err) {
      console.error("[maintenance] failed:", err.message);
    }
  };
  timer = setInterval(run, HOUR);
  timer.unref();
  setTimeout(run, 60_000).unref();
}

module.exports = {
  closeStalePending,
  removeOldGuestData,
  startMaintenanceJob,
  retentionMonths,
  REASON,
  REMOVED_NAME,
};
