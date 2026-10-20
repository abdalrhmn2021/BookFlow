"use client";

// Used by "My appointments" (customer) AND the dashboard (business)

import { useLanguage } from "@/i18n/LanguageContext";
import type { AppointmentStatus } from "@/lib/types";

// Colors per status (the LABEL comes from the dictionary: t.status[status]).
// A small dot + text: the color helps, but the WORD carries the meaning (color-blind friendly).
const STATUS_STYLE: Record<AppointmentStatus, { badge: string; dot: string }> = {
  pending: { badge: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  confirmed: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  completed: { badge: "bg-navy-50 text-navy-700 ring-navy-200", dot: "bg-navy-500" },
  cancelled: { badge: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  "no-show": { badge: "bg-navy-50 text-navy-500 ring-navy-200", dot: "bg-navy-300" },
};

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useLanguage();
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {t.status[status]}
    </span>
  );
}
