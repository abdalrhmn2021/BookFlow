const { isEmailConfigured, sendOperatorEmail, escapeHtml } = require("./notify.service");

// Tells YOU when the server breaks (security/ops review): an email to ALERT_EMAIL for every
// unexpected error (HTTP 500) and every failed background job, through the same Brevo account
// as the booking emails. Without it a broken server is only noticed when a client calls.
//
// Off until ALERT_EMAIL is set (and Brevo: BREVO_API_KEY + MAIL_FROM).
// At most one email every ALERT_EVERY_MINUTES (default 15): a burst of errors doesn't flood
// your inbox or use up the shared Brevo quota - the next email says how many were skipped.
// It never contains the request's full address or body: guest-booking links carry a secret token.

let lastSentAt = 0;
let skipped = 0;

const alertsOn = () => Boolean(process.env.ALERT_EMAIL?.trim()) && isEmailConfigured();

function everyMs() {
  const n = Number(process.env.ALERT_EVERY_MINUTES);
  return (Number.isFinite(n) && n >= 1 ? n : 15) * 60 * 1000;
}

// "GET /api/appointments/:id/status" - the route pattern, never the real URL (ids, tokens).
function whereOf(req) {
  if (!req) return "unknown";
  const route = req.route?.path
    ? `${req.baseUrl || ""}${req.route.path}`
    : `${req.baseUrl || ""} (before the route)`.trim();
  return `${req.method} ${route}`;
}

function buildAlertEmail({ err, where, skippedBefore, at = new Date() }) {
  const stack = String(err?.stack || "")
    .split("\n")
    .slice(0, 8)
    .join("\n");
  const subject = `[BookFlow] Server error: ${where}`.slice(0, 150);
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
      <p><b>Where:</b> ${escapeHtml(where)}<br><b>When:</b> ${escapeHtml(at.toISOString())}</p>
      <p><b>Error:</b> ${escapeHtml(err?.name || "Error")}: ${escapeHtml(err?.message || String(err))}</p>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap">${escapeHtml(stack)}</pre>
      ${skippedBefore ? `<p>${skippedBefore} more error(s) happened since the last email and were not sent.</p>` : ""}
      <p style="color:#71717a">Full details: Render → your service → Logs.</p>
    </div>`;
  return { subject, html };
}

// Returns true when an email went out. Never throws: an alert must not break the request.
async function reportError(err, where) {
  if (!alertsOn()) return false;
  const now = Date.now();
  if (now - lastSentAt < everyMs()) {
    skipped++;
    return false;
  }
  lastSentAt = now;
  const skippedBefore = skipped;
  skipped = 0;
  try {
    await sendOperatorEmail(buildAlertEmail({ err, where, skippedBefore }));
    return true;
  } catch (sendErr) {
    console.error("[alert] could not send the alert email:", sendErr.message);
    return false;
  }
}

const resetAlertsForTests = () => {
  lastSentAt = 0;
  skipped = 0;
};

module.exports = { reportError, whereOf, buildAlertEmail, resetAlertsForTests };
