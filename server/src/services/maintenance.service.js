const Appointment = require("../models/Appointment");

// Housekeeping that keeps the calendar honest.
//
// A "pending" booking that nobody confirmed and nobody closed would stay pending forever and
// keep showing up as "to confirm". PENDING_AUTO_CLOSE_HOURS (default 24) after it ENDED,
// it's cancelled automatically (cancellation.auto = true, so the screens can say why).
// Until then the business can still mark it completed or no-show by hand.

const HOUR = 60 * 60 * 1000;
const REASON = "Closed automatically: it was never confirmed";

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

// Every hour inside the server. A sleeping server (Render free) misses runs - that's fine,
// the dashboard closes its own business's stale bookings whenever it loads.
let timer = null;
function startMaintenanceJob() {
  if (timer) return;
  const run = async () => {
    try {
      const n = await closeStalePending();
      if (n) console.log(`[maintenance] closed ${n} booking(s) nobody confirmed`);
    } catch (err) {
      console.error("[maintenance] failed:", err.message);
    }
  };
  timer = setInterval(run, HOUR);
  timer.unref();
  setTimeout(run, 60_000).unref();
}

module.exports = { closeStalePending, startMaintenanceJob, REASON };
