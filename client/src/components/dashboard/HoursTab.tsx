"use client";

// The weekly schedule editor. The backend replaces ALL 7 days at once (PUT),
// so we edit a local copy and send the whole week when the owner clicks Save.

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { btnPrimary, errorBox } from "@/lib/ui";
import type { DayName, TenantInfo, WorkingDay } from "@/lib/types";

// Display order: the local week starts on Saturday
const WEEK: DayName[] = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

// "HH:mm" strings compare correctly as text: "09:00" < "17:00"
const isValidDay = (d: WorkingDay) => !d.isOpen || (!!d.open && !!d.close && d.close > d.open);

export default function HoursTab({ tenant, onSaved }: { tenant: TenantInfo; onSaved: (t: TenantInfo) => void }) {
  const { t, tError } = useLanguage();
  const h = t.dashboard.hours;

  // Local copy, in our display order. Lazy initializer -> built only once.
  const [days, setDays] = useState<WorkingDay[]>(() =>
    WEEK.map((day) => tenant.workingHours.find((w) => w.day === day) ?? { day, isOpen: false })
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Change one day. Any change hides the old "Saved ✓".
  const update = (day: DayName, changes: Partial<WorkingDay>) => {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, ...changes } : d)));
    setSaved(false);
  };

  const allValid = days.every(isValidDay);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      // Closed days: send only { day, isOpen: false } - old times are meaningless
      const workingHours = days.map((d) => (d.isOpen ? d : { day: d.day, isOpen: false }));
      const { tenant: updated } = await api.put<{ tenant: TenantInfo }>("/tenants/me/working-hours", { workingHours });
      onSaved(updated); // the parent keeps the fresh tenant (the booking page reads these hours)
      setSaved(true);
    } catch (err) {
      setError(tError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500">{h.subtitle}</p>

      <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {days.map((d) => (
          <li key={d.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <label className="flex w-36 items-center gap-2">
              <input
                type="checkbox"
                checked={d.isOpen}
                // Opening a day that has no times yet -> sensible defaults
                onChange={(e) =>
                  update(d.day, { isOpen: e.target.checked, open: d.open ?? "09:00", close: d.close ?? "17:00" })
                }
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="font-medium">{t.days[d.day]}</span>
            </label>

            {d.isOpen ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">{h.from}</span>
                <input
                  type="time"
                  step={900} // 15-minute steps, like the booking slots
                  dir="ltr"
                  value={d.open ?? ""}
                  onChange={(e) => update(d.day, { open: e.target.value })}
                  className="rounded-md border border-gray-300 px-2 py-1"
                />
                <span className="text-gray-500">{h.to}</span>
                <input
                  type="time"
                  step={900}
                  dir="ltr"
                  value={d.close ?? ""}
                  onChange={(e) => update(d.day, { close: e.target.value })}
                  className="rounded-md border border-gray-300 px-2 py-1"
                />
              </div>
            ) : (
              <span className="text-sm text-gray-400">{h.closed}</span>
            )}

            {!isValidDay(d) && <span className="w-full text-sm text-red-600">{h.invalid}</span>}
          </li>
        ))}
      </ul>

      {error && <p className={`mt-3 ${errorBox}`}>{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !allValid} className={btnPrimary}>
          {saving ? t.common.saving : h.save}
        </button>
        {saved && <span className="text-sm text-green-600">{h.saved}</span>}
      </div>
    </div>
  );
}
