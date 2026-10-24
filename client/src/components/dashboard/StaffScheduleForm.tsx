"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { formatLongDate, todayIn } from "@/lib/format";
import { btnPrimary, btnSecondary, errorBox } from "@/lib/ui";
import type { DayName, Service, StaffMember, TenantInfo, WorkingDay } from "@/lib/types";

const WEEK: DayName[] = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

const isValidDay = (d: WorkingDay) => !d.isOpen || (!!d.open && !!d.close && d.close > d.open);

// One staff member's own week, the services they do and their days off.
// Saved with PUT /api/staff/:id/schedule; the server narrows bookings to it.
export default function StaffScheduleForm({
  staff,
  tenant,
  onSaved,
  onCancel,
}: {
  staff: StaffMember;
  tenant: TenantInfo;
  onSaved: (updated: StaffMember) => void;
  onCancel: () => void;
}) {
  const { t, tError } = useLanguage();
  const st = t.dashboard.staff;
  const h = t.dashboard.hours;
  const today = todayIn(tenant.timezone);

  const businessDay = (day: DayName): WorkingDay =>
    tenant.workingHours.find((w) => w.day === day) ?? { day, isOpen: false };

  const [ownHours, setOwnHours] = useState(staff.workingHours !== null);
  const [days, setDays] = useState<WorkingDay[]>(() =>
    WEEK.map((day) => staff.workingHours?.find((w) => w.day === day) ?? businessDay(day)),
  );
  const [serviceIds, setServiceIds] = useState<string[]>(staff.services);
  const [daysOff, setDaysOff] = useState<string[]>(staff.daysOff.filter((d) => d >= today));
  const [newDayOff, setNewDayOff] = useState("");

  const [services, setServices] = useState<Service[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    api
      .get<{ services: Service[] }>("/services")
      .then((data) => !ignore && setServices(data.services.filter((s) => s.isActive)))
      .catch((err) => !ignore && setError(tError(err)));
    return () => {
      ignore = true;
    };
  }, [tError]);

  const updateDay = (day: DayName, changes: Partial<WorkingDay>) =>
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, ...changes } : d)));

  const toggleService = (id: string) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addDayOff = () => {
    if (!newDayOff || newDayOff < today) return;
    setDaysOff((prev) => [...new Set([...prev, newDayOff])].sort());
    setNewDayOff("");
  };

  const valid = !ownHours || days.every(isValidDay);

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { staff: updated } = await api.put<{ staff: StaffMember }>(`/staff/${staff.id}/schedule`, {
        workingHours: ownHours ? days.map((d) => (d.isOpen ? d : { day: d.day, isOpen: false })) : null,
        services: serviceIds,
        daysOff,
      });
      onSaved(updated);
    } catch (err) {
      setError(tError(err));
      setSaving(false);
    }
  };

  const section = "rounded-xl border border-navy-100 bg-white p-4";

  return (
    <div className="space-y-4 rounded-xl border border-navy-200 bg-navy-50 p-4">
      <p className="font-semibold">
        {st.schedule} · {staff.name}
      </p>

      {/* Working hours */}
      <div className={section}>
        <p className="font-medium">{st.hoursTitle}</p>
        <p className="mt-1 text-sm text-navy-500">{st.hoursHint}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!ownHours}
            onChange={(e) => setOwnHours(!e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          {st.useBusinessHours}
        </label>

        {ownHours && (
          <ul className="mt-3 divide-y divide-navy-100">
            {days.map((d) => {
              const closedForBusiness = !businessDay(d.day).isOpen;
              return (
                <li key={d.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                  <label className="flex w-36 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.isOpen && !closedForBusiness}
                      disabled={closedForBusiness}
                      onChange={(e) =>
                        updateDay(d.day, {
                          isOpen: e.target.checked,
                          open: d.open ?? businessDay(d.day).open ?? "09:00",
                          close: d.close ?? businessDay(d.day).close ?? "17:00",
                        })
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="font-medium">{t.days[d.day]}</span>
                  </label>
                  {d.isOpen && !closedForBusiness ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-navy-500">{h.from}</span>
                      <input
                        type="time"
                        step={900}
                        dir="ltr"
                        value={d.open ?? ""}
                        onChange={(e) => updateDay(d.day, { open: e.target.value })}
                        className="rounded-lg border border-navy-200 px-2 py-1"
                      />
                      <span className="text-navy-500">{h.to}</span>
                      <input
                        type="time"
                        step={900}
                        dir="ltr"
                        value={d.close ?? ""}
                        onChange={(e) => updateDay(d.day, { close: e.target.value })}
                        className="rounded-lg border border-navy-200 px-2 py-1"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-navy-400">{h.closed}</span>
                  )}
                  {!isValidDay(d) && <span className="w-full text-sm text-red-600">{h.invalid}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Services */}
      <div className={section}>
        <p className="font-medium">{st.servicesTitle}</p>
        <p className="mt-1 text-sm text-navy-500">{st.servicesHint}</p>
        {!services ? (
          <p className="mt-3 text-sm text-navy-500">{t.common.loading}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {services.map((s) => (
              <label
                key={s._id}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  serviceIds.includes(s._id) ? "border-brand-500 bg-brand-50" : "border-navy-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s._id)}
                  onChange={() => toggleService(s._id)}
                  className="h-4 w-4 accent-brand-600"
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Days off */}
      <div className={section}>
        <p className="font-medium">{st.daysOffTitle}</p>
        <p className="mt-1 text-sm text-navy-500">{st.daysOffHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            min={today}
            value={newDayOff}
            onChange={(e) => setNewDayOff(e.target.value)}
            className="w-48 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm"
          />
          <button type="button" onClick={addDayOff} disabled={!newDayOff} className={btnSecondary}>
            {st.addDayOff}
          </button>
        </div>
        {daysOff.length === 0 ? (
          <p className="mt-3 text-sm text-navy-400">{st.noDaysOff}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {daysOff.map((d) => (
              <li
                key={d}
                className="flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-sm"
              >
                {formatLongDate(d, t.locale)}
                <button
                  type="button"
                  onClick={() => setDaysOff((prev) => prev.filter((x) => x !== d))}
                  aria-label={st.remove}
                  className="text-navy-400 hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className={errorBox}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !valid} className={btnPrimary}>
          {saving ? t.common.saving : st.saveSchedule}
        </button>
        <button onClick={onCancel} disabled={saving} className={btnSecondary}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
