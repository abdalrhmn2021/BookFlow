"use client";

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { btnPrimary, errorBox } from "@/lib/ui";
import type { DayName, TenantInfo, WorkingDay } from "@/lib/types";

const WEEK: DayName[] = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

const isValidDay = (d: WorkingDay) => !d.isOpen || (!!d.open && !!d.close && d.close > d.open);

export default function HoursTab({ tenant, onSaved }: { tenant: TenantInfo; onSaved: (t: TenantInfo) => void }) {
  const { t, tError } = useLanguage();
  const h = t.dashboard.hours;

  const [days, setDays] = useState<WorkingDay[]>(() =>
    WEEK.map((day) => tenant.workingHours.find((w) => w.day === day) ?? { day, isOpen: false }),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const update = (day: DayName, changes: Partial<WorkingDay>) => {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, ...changes } : d)));
    setSaved(false);
  };

  const allValid = days.every(isValidDay);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const workingHours = days.map((d) => (d.isOpen ? d : { day: d.day, isOpen: false }));
      const { tenant: updated } = await api.put<{ tenant: TenantInfo }>("/tenants/me/working-hours", { workingHours });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(tError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-navy-500">{h.subtitle}</p>

      <ul className="mt-4 divide-y divide-navy-100 rounded-xl border border-navy-100 bg-white">
        {days.map((d) => (
          <li key={d.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <label className="flex w-36 items-center gap-2">
              <input
                type="checkbox"
                checked={d.isOpen}
                onChange={(e) =>
                  update(d.day, { isOpen: e.target.checked, open: d.open ?? "09:00", close: d.close ?? "17:00" })
                }
                className="h-4 w-4 accent-coral-600"
              />
              <span className="font-medium">{t.days[d.day]}</span>
            </label>

            {d.isOpen ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-navy-500">{h.from}</span>
                <input
                  type="time"
                  step={900}
                  dir="ltr"
                  value={d.open ?? ""}
                  onChange={(e) => update(d.day, { open: e.target.value })}
                  className="rounded-lg border border-navy-200 px-2 py-1"
                />
                <span className="text-navy-500">{h.to}</span>
                <input
                  type="time"
                  step={900}
                  dir="ltr"
                  value={d.close ?? ""}
                  onChange={(e) => update(d.day, { close: e.target.value })}
                  className="rounded-lg border border-navy-200 px-2 py-1"
                />
              </div>
            ) : (
              <span className="text-sm text-navy-400">{h.closed}</span>
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
        {saved && <span className="text-sm text-emerald-700">{h.saved}</span>}
      </div>
    </div>
  );
}
