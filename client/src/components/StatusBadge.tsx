"use client";

// Used by "My appointments" (customer) AND the dashboard (business)

import { useLanguage } from "@/i18n/LanguageContext";
import type { AppointmentStatus } from "@/lib/types";

// Colors per status (the LABEL comes from the dictionary: t.status[status])
const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-green-50 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-50 text-red-600",
  "no-show": "bg-gray-100 text-gray-500",
};

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useLanguage();
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {t.status[status]}
    </span>
  );
}
