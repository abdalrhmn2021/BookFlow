// Small helpers for showing dates, prices and durations.
//
// A date like "2026-10-03" is a CALENDAR DAY, not a moment in time.
// If we did new Date("2026-10-03") and formatted it in the browser's timezone,
// a user in America would see "October 2" (midnight UTC is still the 2nd there).
// So we always treat these strings as UTC midnight and FORMAT them in UTC too -
// the timezone can never move the day.

import type { DayName } from "./types";

const DAYS: DayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const asUtcDate = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

// Today's date ("YYYY-MM-DD") in the BUSINESS's timezone, not the visitor's.
// At 01:00 in Hebron it's still "yesterday" in London - the business's calendar wins.
// en-CA is used only because it formats dates as YYYY-MM-DD.
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// "2026-09-30" + 1 -> "2026-10-01" (month/year ends handled by the Date object)
export function addDays(dateStr: string, days: number): string {
  const d = asUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-10-03" -> "saturday"  (same logic as the backend's dayNameOf)
export function dayNameOf(dateStr: string): DayName {
  return DAYS[asUtcDate(dateStr).getUTCDay()];
}

// `locale` comes from the dictionary: "en-US" or "ar-u-nu-latn" (t.locale).
// Intl translates month/day names for us - no need to put them in the dictionary.

// "2026-10-03" -> { weekday: "Sat", day: "3", month: "Oct" }  (for the day picker)
//              -> { weekday: "السبت", day: "3", month: "أكتوبر" }
export function formatDayChip(dateStr: string, locale: string) {
  const d = asUtcDate(dateStr);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(d);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
}

// "2026-10-03" -> "Saturday, October 3"  /  "السبت، 3 أكتوبر"
export function formatLongDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(asUtcDate(dateStr));
}

// 90 -> "1h 30min" / "ساعة و30 دقيقة". The words differ per language,
// so we split the number here and let the dictionary build the text.
export function formatDuration(minutes: number, words: (h: number, m: number) => string): string {
  return words(Math.floor(minutes / 60), minutes % 60);
}

// The backend stores a plain number. Change the currency here, in ONE place.
const CURRENCY = "₪";
export function formatPrice(price: number): string {
  return `${price} ${CURRENCY}`;
}

// A real MOMENT in time (from the database, stored in UTC) shown in the BUSINESS's timezone.
// "2026-10-03T07:30:00.000Z" in "Asia/Hebron" -> { date: "Sat, Oct 3", time: "10:30" }
// This is the opposite direction of the backend's localToDate().
export function formatMomentIn(iso: string, timeZone: string, locale: string) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(d),
  };
}
