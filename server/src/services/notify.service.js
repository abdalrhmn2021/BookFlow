const User = require("../models/User");

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

function dashboardLink(startTime, timeZone) {
  const site = (process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/$/, "");
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
async function notifyNewBooking({ tenant, appointment, staff }) {
  if (!isEmailConfigured()) return { sent: 0, skipped: "email not configured" };

  const [owners, customer] = await Promise.all([
    User.find({ tenantId: tenant._id, role: "owner", isActive: true }).select("name email"),
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
    link: dashboardLink(appointment.startTime, tenant.timezone),
  });

  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || tenant.name };
  // One email per person, so staff and owners don't see each other's addresses.
  await Promise.all(
    [...recipients].map(([email, name]) => send({ sender, to: [{ email, name }], subject, htmlContent: html })),
  );
  return { sent: recipients.size };
}

// Pure: the "reset your password" email.
function buildPasswordResetEmail({ name, link, minutes }) {
  const e = escapeHtml;
  const button = (text) =>
    `<p><a href="${e(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${e(text)}</a></p>`;

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
<div dir="rtl" style="text-align:right">
<p>مرحباً ${e(name)}،</p>
<p>وصلنا طلب لتغيير كلمة المرور لحسابك. الرابط صالح لمدة ${minutes} دقيقة ولمرة واحدة.</p>
${button("اختر كلمة مرور جديدة")}
<p style="color:#64748b">إذا ما طلبت هذا، تجاهل الرسالة وكلمة المرور الحالية بتضل زي ما هي.</p>
</div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<div dir="ltr" style="text-align:left">
<p>Hi ${e(name)},</p>
<p>We got a request to reset your password. The link works once, for ${minutes} minutes.</p>
${button("Choose a new password")}
<p style="color:#64748b">If you didn't ask for this, ignore this email; your password stays the same.</p>
</div>
</body></html>`;

  return { subject: "تغيير كلمة المرور · Reset your password", html };
}

async function sendPasswordResetEmail({ email, name, link, minutes }) {
  const { subject, html } = buildPasswordResetEmail({ name, link, minutes });
  const sender = { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "BookFlow" };
  await send({ sender, to: [{ email, name }], subject, htmlContent: html });
}

module.exports = {
  notifyNewBooking,
  buildNewBookingEmail,
  buildPasswordResetEmail,
  sendPasswordResetEmail,
  isEmailConfigured,
  setSenderForTests,
};
