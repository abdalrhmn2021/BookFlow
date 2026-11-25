"use client";

import { useLanguage } from "@/i18n/LanguageContext";

// The server refuses a cancellation reason shorter than this (server/src/services/booking.service.js,
// MIN_REASON_LENGTH). Keep the two equal.
export const MIN_REASON_LENGTH = 10;

// Under a cancellation-reason field: says how many characters are still missing, so a disabled
// "Yes, cancel" button isn't a mystery. Gone once the reason is long enough.
export default function ReasonHint({ reason }: { reason: string }) {
  const { t } = useLanguage();
  const left = MIN_REASON_LENGTH - reason.trim().length;
  if (left <= 0) return null;
  return (
    <span aria-live="polite" className="mt-1 block text-xs text-ink-500">
      {t.myAppointments.reasonMinLength(MIN_REASON_LENGTH, left)}
    </span>
  );
}
