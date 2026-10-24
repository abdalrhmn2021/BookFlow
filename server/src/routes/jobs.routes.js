const crypto = require("crypto");
const express = require("express");
const { sendDueReminders } = require("../services/reminder.service");

const router = express.Router();

// For an outside cron (cron-job.org, Render Cron Job...) when the server can't keep its own
// timer running - e.g. Render's free plan, which sleeps:
//   POST /api/jobs/reminders   header  x-jobs-secret: <JOBS_SECRET>
// Without JOBS_SECRET on the server this route doesn't exist (404).
function requireJobsSecret(req, res, next) {
  const expected = process.env.JOBS_SECRET;
  if (!expected) return res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

  const given = req.get("x-jobs-secret");
  const a = crypto
    .createHash("sha256")
    .update(String(given ?? ""))
    .digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: "Not authorized" });
  next();
}

router.post("/reminders", requireJobsSecret, async (req, res) => {
  res.status(200).json(await sendDueReminders());
});

module.exports = router;
