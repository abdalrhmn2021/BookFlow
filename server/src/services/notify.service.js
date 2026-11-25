const User = require("../models/User");
const Appointment = require("../models/Appointment");
const EmailUsage = require("../models/EmailUsage");

// New-booking emails to the business owner(s) and the staff member who was booked.
// Sent through Brevo's HTTPS API: Render's free plan blocks SMTP ports (25/465/587),
// so a normal SMTP mailer would never connect there.
// Off until BREVO_API_KEY and MAIL_FROM (a sender verified in Brevo) are set.
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

const isEmailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

async function sendWithBrevo(message) {
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Brevo answered ${res.status}: ${details.slice(0, 200)}`);
  }
}

// Tests swap the sender so nothing leaves the machine.
let send = sendWithBrevo;
const setSenderForTests = (fn) => {
  send = fn || sendWithBrevo;
};

// ---- Daily email budget (security review H-2) ----
// Every email of the server goes out through ONE Brevo account (free plan: 300 a day). Without a
// budget, a script signing up with made-up addresses could use the whole day's emails from one
// IP - then no business on the server could send sign-up codes or "forgot password" codes.
//   EMAIL_DAILY_BUDGET     emails per day (UTC) for the whole server. Default 250 (under Brevo's 300).
//   EMAIL_ACCOUNT_RESERVE  the last part of the budget, kept for account emails (sign-up and
//                          password codes, alerts to you): "new booking" emails stop before it.
//                          Default 50.
const posInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};
const emailDailyBudget = () => posInt(process.env.EMAIL_DAILY_BUDGET, 250);
const accountReserve = () => posInt(process.env.EMAIL_ACCOUNT_RESERVE, 50);
const emailDay = () => new Date().toISOString().slice(0, 10);

// kind: "account" (codes, alerts) may use the whole budget; "notification" stops at budget - reserve.
const limitFor = (kind) => (kind === "notification" ? emailDailyBudget() - accountReserve() : emailDailyBudget());

// Takes one email from today's budget in one atomic update (two requests can't both take the
// last one). false = used up until tomorrow (UTC).
async function takeEmailSlot(kind) {
  const limit = limitFor(kind);
  if (limit <= 0) return false;
  const day = emailDay();
  const take = (upsert) => EmailUsage.updateOne({ day, count: { $lt: limit } }, { $inc: { count: 1 } }, { upsert });
  try {
    await take(true); // the day's first email creates the document
    return true;
  } catch (err) {
    // Duplicate key: today's document exists and is full - or another request just created it,
    // so try once more without creating.
    if (err.code !== 11000) throw err;
    return (await take(false)).modifiedCount === 1;
  }
}

// Is there still room today? For the routes that exist to send an email (sign-up, "forgot
// password", a new code): they answer 503 up front instead of making an account whose code
// can't be sent.
async function hasEmailBudget(kind = "account") {
  const today = await EmailUsage.findOne({ day: emailDay() }).select("count").lean();
  return (today?.count ?? 0) < limitFor(kind);
}

let budgetWarnedOn = null;
// Every email goes through here: one slot from the budget, then the real send.
async function deliver(kind, message) {
  if (!(await takeEmailSlot(kind))) {
    if (budgetWarnedOn !== emailDay()) {
      budgetWarnedOn = emailDay();
      console.warn(`[email] daily budget reached (${kind} emails stop until tomorrow, UTC)`);
    }
    return false;
  }
  await send(message);
  return true;
}

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const formatWhen = (date, timeZone, locale) =>
  new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).format(date);

// `site` = the site the booking was made on (utils/siteUrl), so on a shared server the owner's
// link opens THEIR site. Without it: the first CLIENT_URL.
function dashboardLink(startTime, timeZone, site) {
  site = site || (process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/$/, "");
  if (!site) return null;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(startTime);
  return `${site}/dashboard?tab=schedule&date=${day}`;
}

const AR = { service: "الخدمة", staff: "عند", when: "الموعد", customer: "الزبون", phone: "الجوال", notes: "ملاحظات" };
const EN = { service: "Service", staff: "With", when: "When", customer: "Customer", phone: "Phone", notes: "Notes" };

// Pure: builds the email from plain values (easy to test, no database).
function buildNewBookingEmail({
  businessName,
  timezone,
  serviceName,
  staffName,
  startTime,
  customerName,
  customerPhone,
  notes,
  link,
}) {
  const whenAr = formatWhen(startTime, timezone, "ar");
  const whenEn = formatWhen(startTime, timezone, "en-GB");
  const e = escapeHtml;

  const rows = (labels) =>
    [
      [labels.service, serviceName],
      [labels.staff, staffName],
      [labels.when, labels === AR ? whenAr : whenEn],
      [labels.customer, customerName],
      [labels.phone, customerPhone],
      [labels.notes, notes],
    ]
      .filter(([, value]) => value)
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px;color:#64748b">${e(label)}</td><td style="padding:4px 12px"><b>${e(value)}</b></td></tr>`,
      )
      .join("");

  const button = (text) =>
    link
      ? `<p><a href="${e(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${e(text)}</a></p>`
      : "";

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
<div dir="rtl" style="text-align:right">
<h2 style="margin:0 0 8px">حجز جديد في ${e(businessName)}</h2>
<p style="margin:0 0 12px">الحجز بانتظار تأكيدك من لوحة التحكم.</p>
<table>${rows(AR)}</table>
${button("افتح المواعيد")}
</div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<div dir="ltr" style="text-align:left">
<h2 style="margin:0 0 8px">New booking at ${e(businessName)}</h2>
<p style="margin:0 0 12px">It is waiting for you to confirm it in the dashboard.</p>
<table>${rows(EN)}</table>
${button("Open the schedule")}
</div>
</body></html>`;

  return { subject: `حجز جديد · New booking: ${serviceName} — ${whenEn}`, html };
}

// Called after a booking is saved. Never throws into the booking: callers fire and forget.
// "New booking" emails per business per 24 hours. All businesses on a server share one email
// account (Brevo free: 300 a day), so a flood of bookings at one business must not use it all -
// the "forgot password" codes of every business go out through the same account.
const newBookingEmailsPerDay = () => {
  const n = Number(process.env.NEW_BOOKING_EMAILS_PER_DAY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20;
};

async function notifyNewBooking({ tenant, appointment, staff, site }) {
  if (!isEmailConfigured()) return { sent: 0, skipped: "email not configured" };

  // Counts this booking too. Past the limit the dashboard still shows every booking (and its
  // new-booking alerts) - only the emails stop until tomorrow.
  const lastDay = await Appointment.countDocuments({
    tenantId: tenant._id,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  if (lastDay > newBookingEmailsPerDay()) return { sent: 0, skipped: "daily email limit" };

  // The owner (to keep an eye on things) and the receptionist (who confirms it).
  const [owners, customer] = await Promise.all([
    User.find({ tenantId: tenant._id, role: { $in: ["owner", "receptionist"] }, isActive: true }).select("name email"),
    appointment.customerId ? User.findById(appointment.customerId).select("name phone") : null,
  ]);

  const recipients = new Map();
  for (const person of [...owners, staff]) {
    if (person?.email && person.isActive !== false) recipients.set(person.email, person.name);
  }
  if (!recipients.size) return { sent: 0, skipped: "no recipients" };

  const { subject, html } = buildNewBookingEmail({
    businessName: tenant.name,
    timezone: tenant.timezone,
    serviceName: appointment.serviceName,
    staffName: staff?.name,
    startTime: appointment.startTime,
    customerName: appointment.guest?.name ?? customer?.name,
    customerPhone: appointment.guest?.phone ?? customer?.phone,
    notes: appointment.notes,
    link: dashboardLink(appointment.startTime, tenant.timezone, site),
  });

  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || tenant.name };
  // One email per person, so staff and owners don't see each other's addresses.
  const results = await Promise.all(
    [...recipients].map(([email, name]) =>
      deliver("notification", { sender, to: [{ email, name }], subject, htmlContent: html }),
    ),
  );
  const sent = results.filter(Boolean).length;
  return sent === recipients.size ? { sent } : { sent, skipped: "daily email budget" };
}

// Pure: the "reset your password" email, with the 6-digit code.
function buildPasswordResetEmail({ name, code, minutes }) {
  const e = escapeHtml;
  const codeBox = `<p style="font-size:28px;font-weight:bold;letter-spacing:8px;font-family:monospace;background:#f1f5f9;border-radius:8px;padding:12px 18px;display:inline-block;direction:ltr">${e(code)}</p>`;

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
<div dir="rtl" style="text-align:right">
<p>مرحباً ${e(name)}،</p>
<p>وصلنا طلب لتغيير كلمة المرور لحسابك. اكتب هذا الرمز في صفحة "نسيت كلمة المرور":</p>
${codeBox}
<p>الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة. لا تعطه لأي شخص، ولن نطلبه منك أبداً بالهاتف أو الرسائل.</p>
<p style="color:#64748b">إذا ما طلبت هذا، تجاهل الرسالة وكلمة المرور الحالية بتضل زي ما هي.</p>
</div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<div dir="ltr" style="text-align:left">
<p>Hi ${e(name)},</p>
<p>We got a request to reset your password. Type this code on the "Forgot password" page:</p>
${codeBox}
<p>The code works once, for ${minutes} minutes. Don't share it with anyone - we will never ask for it by phone or message.</p>
<p style="color:#64748b">If you didn't ask for this, ignore this email; your password stays the same.</p>
</div>
</body></html>`;

  return { subject: `${code} رمز تغيير كلمة المرور · Password reset code`, html };
}

async function sendPasswordResetEmail({ email, name, code, minutes }) {
  const { subject, html } = buildPasswordResetEmail({ name, code, minutes });
  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "BookFlow" };
  await deliver("account", { sender, to: [{ email, name }], subject, htmlContent: html });
}

// Pure: the "confirm your email" email sent after signing up, with the 6-digit code.
function buildVerificationEmail({ name, code, minutes }) {
  const e = escapeHtml;
  const codeBox = `<p style="font-size:28px;font-weight:bold;letter-spacing:8px;font-family:monospace;background:#f1f5f9;border-radius:8px;padding:12px 18px;display:inline-block;direction:ltr">${e(code)}</p>`;

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
<div dir="rtl" style="text-align:right">
<p>مرحباً ${e(name)}،</p>
<p>شكراً لتسجيلك. لتأكيد بريدك الإلكتروني وتفعيل حسابك، اكتب هذا الرمز في صفحة التسجيل:</p>
${codeBox}
<p>الرمز صالح لمدة ${minutes} دقيقة. لا تعطه لأي شخص.</p>
<p style="color:#64748b">إذا ما سجّلت أنت، تجاهل هذه الرسالة وما رح ينفعّل أي حساب ببريدك.</p>
</div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<div dir="ltr" style="text-align:left">
<p>Hi ${e(name)},</p>
<p>Thanks for signing up. To confirm your email and activate your account, type this code on the sign-up page:</p>
${codeBox}
<p>The code works for ${minutes} minutes. Don't share it with anyone.</p>
<p style="color:#64748b">If you didn't sign up, ignore this email - no account will be activated with your address.</p>
</div>
</body></html>`;

  return { subject: `${code} رمز تأكيد البريد · Email confirmation code`, html };
}

async function sendVerificationEmail({ email, name, code, minutes }) {
  const { subject, html } = buildVerificationEmail({ name, code, minutes });
  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "BookFlow" };
  await deliver("account", { sender, to: [{ email, name }], subject, htmlContent: html });
}

// An email to the person running the server (ALERT_EMAIL), e.g. services/alert.service.js.
async function sendOperatorEmail({ subject, html }) {
  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "BookFlow" };
  await deliver("account", { sender, to: [{ email: process.env.ALERT_EMAIL.trim() }], subject, htmlContent: html });
}

module.exports = {
  notifyNewBooking,
  sendOperatorEmail,
  escapeHtml,
  buildNewBookingEmail,
  buildPasswordResetEmail,
  sendPasswordResetEmail,
  buildVerificationEmail,
  sendVerificationEmail,
  isEmailConfigured,
  hasEmailBudget,
  takeEmailSlot,
  setSenderForTests,
};
