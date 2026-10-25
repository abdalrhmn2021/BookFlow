const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const toHHMM = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const fitsInWorkingHours = (workingHours, dayName, startHHMM, durationMin) => {
  const day = workingHours.find((d) => d.day === dayName);
  if (!day || !day.isOpen) return false;

  const start = toMinutes(startHHMM);
  const end = start + durationMin;
  return start >= toMinutes(day.open) && end <= toMinutes(day.close);
};

const isOverlapping = (aStart, aEnd, bStart, bEnd) => {
  if (bStart >= aEnd || bEnd <= aStart) {
    return false;
  }
  return true;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (dateStr) => {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
};

const dayNameOf = (dateStr) => DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

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

// Local date + time in `timeZone` -> the real UTC moment.
// The offset is read twice: the first guess can fall on the other side of a daylight-saving
// change (e.g. 00:30 on the day clocks go back), so it is re-read at the corrected moment.
// A local time that doesn't exist (skipped when clocks go forward) maps to the moment just
// after the jump, e.g. 02:30 -> 03:30.
const localToDate = (dateStr, hhmm, timeZone) => {
  const wall = new Date(`${dateStr}T${hhmm}:00Z`).getTime();
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60000;
  const second = wall - offsetMinutes(new Date(first), timeZone) * 60000;
  if (second === first) return new Date(first);
  // The two offsets disagree: keep the one that really shows this wall-clock time, if any.
  if (first + offsetMinutes(new Date(first), timeZone) * 60000 === wall) return new Date(first);
  if (second + offsetMinutes(new Date(second), timeZone) * 60000 === wall) return new Date(second);
  return new Date(Math.max(first, second));
};

const nextDate = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

module.exports = {
  DAYS,
  TIME_REGEX,
  toMinutes,
  toHHMM,
  fitsInWorkingHours,
  isOverlapping,
  isValidDate,
  dayNameOf,
  localToDate,
  nextDate,
};
