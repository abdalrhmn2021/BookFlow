import type { DayName } from "./types";

const DAYS: DayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// "YYYY-MM-DD" is a calendar day, so it is parsed and formatted in UTC: the viewer's
// timezone must never shift it to the previous/next day.
const asUtcDate = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = asUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayNameOf(dateStr: string): DayName {
  return DAYS[asUtcDate(dateStr).getUTCDay()];
}

export function formatDayChip(dateStr: string, locale: string) {
  const d = asUtcDate(dateStr);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(d);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
}

export function formatLongDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(asUtcDate(dateStr));
}

export function formatDuration(minutes: number, words: (h: number, m: number) => string): string {
  return words(Math.floor(minutes / 60), minutes % 60);
}

const CURRENCY = "₪";
export function formatPrice(price: number): string {
  return `${price} ${CURRENCY}`;
}

export function formatMomentIn(iso: string, timeZone: string, locale: string) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
      d,
    ),
  };
}
