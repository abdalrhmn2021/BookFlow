// Helpers for working with "HH:mm" times as minutes since midnight.
// Comparing numbers (540 < 1020) is simpler and safer than comparing strings.

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00 - 23:59

// "09:30" -> 570
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// 570 -> "09:30"
const toHHMM = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Does a service that starts at `startHHMM` and lasts `durationMin` fit
// completely inside the business hours of `dayName`?
// Both the START and the END must be within opening hours.
const fitsInWorkingHours = (workingHours, dayName, startHHMM, durationMin) => {
  const day = workingHours.find((d) => d.day === dayName);
  if (!day || !day.isOpen) return false; // closed that day

  const start = toMinutes(startHHMM);
  const end = start + durationMin;
  return start >= toMinutes(day.open) && end <= toMinutes(day.close);
};

// ============================================================
// ✍️  YOUR TASK: write this function
// ------------------------------------------------------------
// Two appointments, each has a start and an end (in minutes since midnight).
// Return true if they overlap (share any time), otherwise false.
//
// Example:  A = 600-660 (10:00-11:00), B = 630-690 (10:30-11:30)  -> true
//           A = 600-660 (10:00-11:00), B = 660-720 (11:00-12:00)  -> false
//           (one ends exactly when the other starts = NO overlap)
//
// Check your answer with:   node practice/check-overlap.js
// ============================================================
const isOverlapping = (aStart, aEnd, bStart, bEnd) => {
  // Free if B starts after A ends, or B ends before A starts
  if (bStart >= aEnd || bEnd <= aStart) {
    return false;
  }
  return true;
};

// ============================================================
// Dates (for appointments)
// ============================================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/; // "2026-09-25"

// "2026-09-25" -> true,  "2026-02-31" -> false (that day doesn't exist)
const isValidDate = (dateStr) => {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
};

// "2026-09-25" -> "friday"
// A calendar date has the same weekday everywhere, so UTC is safe here.
const dayNameOf = (dateStr) => DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

// How many minutes `timeZone` is ahead of UTC at a given moment
// (e.g. Asia/Hebron = +180 in summer, +120 in winter).
const offsetMinutes = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asIfUtc - date.getTime()) / 60000);
};

// The business says "10:30 on 2026-09-25" in ITS local time.
// MongoDB stores dates in UTC, so we convert to the real moment in time:
//   ("2026-09-25", "10:30", "Asia/Hebron") -> 2026-09-25T07:30:00.000Z
const localToDate = (dateStr, hhmm, timeZone) => {
  const guess = new Date(`${dateStr}T${hhmm}:00Z`); // pretend it's UTC first
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
};

module.exports = {
  DAYS,
  TIME_REGEX,
  DATE_REGEX,
  toMinutes,
  toHHMM,
  fitsInWorkingHours,
  isOverlapping,
  isValidDate,
  dayNameOf,
  localToDate,
};
