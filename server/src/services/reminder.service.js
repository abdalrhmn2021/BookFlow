const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const { ACTIVE_STATUSES } = require("./booking.service");
const { isWhatsAppConfigured, toWhatsAppNumber, sendTemplate } = require("./whatsapp.service");

// The automatic WhatsApp reminder.
//
// Every few minutes the job looks for active bookings that start within the next
// REMINDER_HOURS_BEFORE hours (default 24), at businesses that have WhatsApp reminders on,
// and sends each customer one template message. A booking counts as reminded once
// reminderSentAt is set - by this job OR by the dashboard's manual WhatsApp button -
// so nobody gets two reminders.

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const MAX_ATTEMPTS = 3; // after that we stop trying (bad number, blocked, ...)
const CLAIM_TIMEOUT = 10 * MINUTE; // a run that crashed mid-send frees its bookings after this
const MIN_LEAD = HOUR; // starting in less than an hour: too late to be useful
const FRESH_BOOKING = 30 * MINUTE; // just booked: they know already, don't message right away
const BATCH = 100;

const hoursBefore = () => {
  const n = Number(process.env.REMINDER_HOURS_BEFORE);
  return Number.isFinite(n) && n >= 2 && n <= 72 ? n : 24;
};

// "الثلاثاء 27 أكتوبر، 16:45" in the business's time zone (Latin digits, like the emails).
function formatWhen(date, timeZone) {
  const lang = (process.env.WHATSAPP_TEMPLATE_LANG || "ar").toLowerCase();
  return new Intl.DateTimeFormat(lang.startsWith("en") ? "en-GB" : "ar", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).format(date);
}

// The 4 template variables, in order: customer, business, service, date and time.
function reminderParams(appointment, tenant) {
  const name = appointment.guest?.name ?? appointment.customerId?.name ?? "";
  return [name, tenant.name, appointment.serviceName, formatWhen(appointment.startTime, tenant.timezone)];
}

const release = (id, update) =>
  Appointment.updateOne({ _id: id }, { ...update, $unset: { "autoReminder.claimedAt": 1 } });

async function remindOne(candidate, tenant, now) {
  // Claim it first, so two job runs (or two servers) never send the same reminder twice.
  // The filter re-checks everything: it may have been cancelled or reminded by hand meanwhile.
  const appointment = await Appointment.findOneAndUpdate(
    {
      _id: candidate._id,
      status: { $in: ACTIVE_STATUSES },
      reminderSentAt: null,
      $or: [{ "autoReminder.claimedAt": null }, { "autoReminder.claimedAt": { $lt: new Date(now - CLAIM_TIMEOUT) } }],
    },
    { $set: { "autoReminder.claimedAt": now } },
    { returnDocument: "after" },
  ).populate("customerId", "name phone");
  if (!appointment) return "skipped";

  const phone = appointment.guest?.phone ?? appointment.customerId?.phone;
  const to = toWhatsAppNumber(phone, tenant.phoneCountryCode);
  if (!to) {
    // Nothing to retry: no phone, or not one WhatsApp understands.
    await release(appointment._id, {
      $set: { "autoReminder.attempts": MAX_ATTEMPTS, "autoReminder.lastError": "No valid phone number" },
    });
    return "skipped";
  }

  try {
    await sendTemplate({ to, params: reminderParams(appointment, tenant) });
  } catch (err) {
    await release(appointment._id, {
      $inc: { "autoReminder.attempts": 1 },
      $set: { "autoReminder.lastError": String(err.message).slice(0, 300) },
    });
    console.error(`[reminder] WhatsApp to booking ${appointment._id} failed:`, err.message);
    return "failed";
  }

  await release(appointment._id, {
    $set: { reminderSentAt: new Date(), reminderChannel: "whatsapp" },
    $unset: { "autoReminder.lastError": 1 },
  });
  return "sent";
}

// One pass. Safe to call any time and as often as you like.
async function sendDueReminders({ now = new Date() } = {}) {
  const result = { checked: 0, sent: 0, failed: 0, skipped: 0 };
  if (!isWhatsAppConfigured()) return { ...result, off: "WhatsApp is not configured" };

  const tenants = await Tenant.find({ whatsappReminders: true, isActive: true })
    .select("name timezone phoneCountryCode")
    .lean();
  if (!tenants.length) return result;
  const byId = new Map(tenants.map((t) => [String(t._id), t]));

  const candidates = await Appointment.find({
    tenantId: { $in: tenants.map((t) => t._id) },
    status: { $in: ACTIVE_STATUSES },
    startTime: { $gt: new Date(now.getTime() + MIN_LEAD), $lte: new Date(now.getTime() + hoursBefore() * HOUR) },
    createdAt: { $lte: new Date(now.getTime() - FRESH_BOOKING) },
    reminderSentAt: null,
    "autoReminder.attempts": { $not: { $gte: MAX_ATTEMPTS } },
  })
    .select("_id tenantId")
    .sort({ startTime: 1 })
    .limit(BATCH)
    .lean();

  // One at a time: a few reminders every 10 minutes, no need to hammer the API.
  for (const c of candidates) {
    result.checked++;
    result[await remindOne(c, byId.get(String(c.tenantId)), now)]++;
  }
  return result;
}

// Runs the job every REMINDER_JOB_MINUTES (default 10) inside the server process.
// On Render's free plan the server sleeps, so use the /api/jobs/reminders endpoint with an
// outside cron instead (docs/INSTALL.md); both can run together safely.
let timer = null;
function startReminderJob() {
  if (timer) return;
  if (!isWhatsAppConfigured()) {
    console.log("[reminder] WhatsApp not configured - automatic reminders are off");
    return;
  }
  const minutes = Math.max(1, Number(process.env.REMINDER_JOB_MINUTES) || 10);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await sendDueReminders();
      if (r.checked)
        console.log(`[reminder] checked ${r.checked}: sent ${r.sent}, failed ${r.failed}, skipped ${r.skipped}`);
    } catch (err) {
      console.error("[reminder] job failed:", err.message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, minutes * MINUTE);
  timer.unref();
  setTimeout(tick, 30_000).unref(); // first pass shortly after start-up
  console.log(`[reminder] automatic WhatsApp reminders every ${minutes} min, ${hoursBefore()}h before`);
}

module.exports = { sendDueReminders, startReminderJob, reminderParams, formatWhen, MAX_ATTEMPTS };
