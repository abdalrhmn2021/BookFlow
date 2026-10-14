"use client";

// The first screen of the dashboard: today's numbers + the "day board".
// The day board = one column per staff member, every appointment placed at its real time,
// and a coral line at "now". Owners see everyone; a staff member sees only himself
// (the backend already filters /appointments/business for staff).
// No new backend code: it reuses /appointments/business and /staff.

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { addDays, dayNameOf, formatLongDate, formatMomentIn, formatPrice, todayIn } from "@/lib/format";
import { btnSecondary, errorBox } from "@/lib/ui";
import type { AppointmentStatus, BusinessAppointment, StaffMember, TenantInfo } from "@/lib/types";
import { IconChevronEnd, IconChevronStart } from "./icons";

const PX_PER_MIN = 1.1; // 66px per hour

// "10:30" <-> 630 (minutes since midnight)
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const isActive = (a: BusinessAppointment) => a.status === "pending" || a.status === "confirmed";
const nameOf = (a: BusinessAppointment) => a.guest?.name ?? a.customerId?.name;

// The color of a block tells its status at a glance
const BLOCK_STYLE: Record<AppointmentStatus, string> = {
  pending: "border-s-4 border-coral-500 bg-coral-50 text-ink-950",
  confirmed: "border-s-4 border-ink-900 bg-ink-50 text-ink-950",
  completed: "border-s-4 border-emerald-600 bg-emerald-50 text-emerald-950",
  "no-show": "border-s-4 border-slate-400 bg-slate-100 text-slate-500",
  cancelled: "border border-dashed border-slate-300 bg-white text-slate-400 line-through",
};

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900";

interface Props {
  tenant: TenantInfo;
  isOwner: boolean;
  onOpenSchedule: (date: string) => void; // clicking a block opens the full list of that day
}

export default function OverviewTab({ tenant, isOwner, onOpenSchedule }: Props) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const o = t.dashboard.overview;
  const s = t.dashboard.schedule;
  const tz = tenant.timezone;

  const [date, setDate] = useState(() => todayIn(tz));
  // The result remembers WHICH day it belongs to (a fast click on "next day" can't show old data)
  const [result, setResult] = useState<{ date: string; list?: BusinessAppointment[]; error?: unknown } | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Move the "now" line once a minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ appointments: BusinessAppointment[] }>(`/appointments/business?date=${date}`)
      .then((data) => {
        if (!ignore) setResult({ date, list: data.appointments });
      })
      .catch((err) => {
        if (!ignore) setResult({ date, error: err });
      });
    return () => {
      ignore = true;
    };
  }, [date]);

  // Owners get a column for EVERY active staff member, even with an empty day
  useEffect(() => {
    if (!isOwner) return;
    let ignore = false;
    api
      .get<{ staff: StaffMember[] }>("/staff")
      .then((data) => {
        if (!ignore) setStaff(data.staff);
      })
      .catch(() => {
        if (!ignore) setStaff([]);
      });
    return () => {
      ignore = true;
    };
  }, [isOwner]);

  const current = result?.date === date ? result : null; // null -> still loading
  const list = current?.list ?? [];
  const today = todayIn(tz);
  const isToday = date === today;

  // ---------- The numbers ----------
  const booked = list.filter((a) => a.status !== "cancelled");
  const pending = list.filter((a) => a.status === "pending").length;
  const revenue = list
    .filter((a) => a.status !== "cancelled" && a.status !== "no-show")
    .reduce((sum, a) => sum + a.price, 0);
  const next = list
    .filter((a) => isActive(a) && (!isToday || new Date(a.startTime) > now))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  // ---------- The columns ----------
  const columns: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  const addColumn = (id: string, name: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      columns.push({ id, name });
    }
  };
  if (isOwner) (staff ?? []).filter((m) => m.isActive).forEach((m) => addColumn(m.id, m.name));
  else if (user) addColumn(String(user.id), user.name);
  // A deactivated staff member can still have appointments that day -> still gets a column
  list.forEach((a) => addColumn(a.staffId._id, a.staffId.name));

  // ---------- The time axis ----------
  const startOf = (a: BusinessAppointment) => toMin(formatMomentIn(a.startTime, tz, t.locale).time);
  const endOf = (a: BusinessAppointment) => toMin(formatMomentIn(a.endTime, tz, t.locale).time) || 24 * 60;

  const day = tenant.workingHours.find((d) => d.day === dayNameOf(date));
  const isOpen = Boolean(day?.isOpen && day.open && day.close);
  let rangeStart = isOpen ? toMin(day!.open!) : 9 * 60;
  let rangeEnd = isOpen ? toMin(day!.close!) : 17 * 60;
  for (const a of list) {
    rangeStart = Math.min(rangeStart, startOf(a));
    rangeEnd = Math.max(rangeEnd, endOf(a));
  }
  rangeStart = Math.floor(rangeStart / 60) * 60;
  rangeEnd = Math.ceil(rangeEnd / 60) * 60;
  const hours: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) hours.push(m);
  const boardHeight = (rangeEnd - rangeStart) * PX_PER_MIN;
  const y = (min: number) => (min - rangeStart) * PX_PER_MIN;

  const nowMin = toMin(formatMomentIn(now.toISOString(), tz, t.locale).time);
  const showNow = isToday && nowMin >= rangeStart && nowMin <= rangeEnd;

  // A cancelled booking frees its time - if someone booked it again, show only the new one
  const blocksOf = (staffId: string) => {
    const mine = list.filter((a) => a.staffId._id === staffId);
    return mine.filter(
      (a) =>
        a.status !== "cancelled" ||
        !mine.some((b) => b.status !== "cancelled" && startOf(b) < endOf(a) && endOf(b) > startOf(a))
    );
  };

  return (
    <div className="space-y-6">
      {/* ---- Which day ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink-950">{formatLongDate(date, t.locale)}</h2>
          {!isOpen && <p className="mt-1 text-sm text-slate-500">{o.closed}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} className={iconBtn} aria-label={s.prevDay} title={s.prevDay}>
            <IconChevronStart className="rtl:-scale-x-100" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(today)} className={btnSecondary}>
              {s.today}
            </button>
          )}
          <button onClick={() => setDate(addDays(date, 1))} className={iconBtn} aria-label={s.nextDay} title={s.nextDay}>
            <IconChevronEnd className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      {/* ---- The numbers: one panel split by hairlines ---- */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
        <div className="bg-white p-5">
          <dt className="text-sm text-slate-500">{o.appointments}</dt>
          <dd className="tabular mt-2 text-3xl font-semibold text-ink-950">{current ? booked.length : "–"}</dd>
        </div>
        <div className="bg-white p-5">
          <dt className="text-sm text-slate-500">{o.pending}</dt>
          <dd className={`tabular mt-2 text-3xl font-semibold ${pending > 0 ? "text-coral-700" : "text-ink-950"}`}>
            {current ? pending : "–"}
          </dd>
        </div>
        <div className="bg-white p-5">
          <dt className="text-sm text-slate-500">{o.revenue}</dt>
          <dd className="tabular mt-2 text-3xl font-semibold text-ink-950">{current ? formatPrice(revenue) : "–"}</dd>
        </div>
        <div className="bg-white p-5">
          <dt className="text-sm text-slate-500">{o.next}</dt>
          {next ? (
            <dd className="mt-2">
              <span dir="ltr" className="tabular block text-3xl font-semibold text-ink-950">
                {formatMomentIn(next.startTime, tz, t.locale).time}
              </span>
              <span className="mt-1 block truncate text-sm font-medium text-slate-700">{nameOf(next) ?? s.noCustomer}</span>
              <span className="block truncate text-xs text-slate-500">{next.serviceName}</span>
            </dd>
          ) : (
            <dd className="mt-3 text-sm text-slate-500">{current ? o.noNext : "–"}</dd>
          )}
        </div>
      </dl>

      {/* ---- The day board ---- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-ink-950">{isOwner ? o.board : o.staffView}</h3>
          <button
            onClick={() => onOpenSchedule(date)}
            className="rounded-md text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-950 hover:underline"
          >
            {o.manage}
          </button>
        </div>

        {current?.error ? (
          <div className="p-5">
            <p className={errorBox}>{tError(current.error)}</p>
          </div>
        ) : !current || (isOwner && !staff) ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{s.loading}</p>
        ) : columns.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{o.noStaff}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-max">
                {/* Staff names */}
                <div className="flex border-b border-slate-100 bg-slate-50/60">
                  <div className="w-14 shrink-0" />
                  {columns.map((c) => (
                    <div key={c.id} className="w-48 shrink-0 border-s border-slate-100 px-3 py-3 sm:w-56">
                      <p className="truncate text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {s.count(list.filter((a) => a.staffId._id === c.id && a.status !== "cancelled").length)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Time grid + blocks */}
                <div className="relative flex" style={{ height: boardHeight + 16 }}>
                  <div className="relative w-14 shrink-0">
                    {hours.map((m) => (
                      <span
                        key={m}
                        dir="ltr"
                        className="tabular absolute start-2 -translate-y-1/2 text-xs text-slate-400"
                        style={{ top: y(m) + 8 }}
                      >
                        {toHHMM(m)}
                      </span>
                    ))}
                  </div>

                  {columns.map((c) => (
                    <div key={c.id} className="relative w-48 shrink-0 border-s border-slate-100 sm:w-56">
                      {hours.map((m) => (
                        <div key={m} className="absolute inset-x-0 border-t border-slate-100" style={{ top: y(m) + 8 }} />
                      ))}
                      {blocksOf(c.id).map((a) => {
                        const start = startOf(a);
                        const height = Math.max(30, (endOf(a) - start) * PX_PER_MIN - 4);
                        const time = formatMomentIn(a.startTime, tz, t.locale).time;
                        return (
                          <button
                            key={a._id}
                            onClick={() => onOpenSchedule(date)}
                            title={`${time} ${nameOf(a) ?? ""} - ${a.serviceName} (${t.status[a.status]})`}
                            className={`absolute inset-x-1.5 overflow-hidden rounded-lg px-2.5 py-1 text-start text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-900 ${BLOCK_STYLE[a.status]}`}
                            style={{ top: y(start) + 10, height }}
                          >
                            <span dir="ltr" className="tabular block font-semibold">
                              {time}
                            </span>
                            <span className="block truncate font-medium">{nameOf(a) ?? s.noCustomer}</span>
                            {height > 52 && <span className="block truncate opacity-75">{a.serviceName}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {/* Now */}
                  {showNow && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                      style={{ top: y(nowMin) + 8 - 1 }}
                      aria-hidden="true"
                    >
                      <span className="ms-12 h-2.5 w-2.5 shrink-0 rounded-full bg-coral-500" />
                      <span className="h-0.5 flex-1 bg-coral-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {list.length === 0 && (
              <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">{o.emptyDay}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
