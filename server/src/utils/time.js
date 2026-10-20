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

// Local date + time in `timeZone` -> the real UTC moment (handles DST via offsetMinutes).
const localToDate = (dateStr, hhmm, timeZone) => {
  const guess = new Date(`${dateStr}T${hhmm}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
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
