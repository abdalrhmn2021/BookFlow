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
  // TODO: write your code here

};

module.exports = { DAYS, TIME_REGEX, toMinutes, toHHMM, fitsInWorkingHours, isOverlapping };
