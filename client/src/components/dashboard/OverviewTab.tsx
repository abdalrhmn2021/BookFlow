"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { IconChevron, IconPhone } from "@/components/icons";
import { api } from "@/lib/api";
import { formatDayChip, formatMomentIn, formatPrice } from "@/lib/format";
import { card, errorBox } from "@/lib/ui";
import type { AppointmentStatus, BusinessStats } from "@/lib/types";

const BAR: { status: AppointmentStatus; color: string }[] = [
  { status: "completed", color: "bg-ink-500" },
  { status: "confirmed", color: "bg-emerald-500" },
  { status: "pending", color: "bg-amber-400" },
  { status: "no-show", color: "bg-ink-300" },
  { status: "cancelled", color: "bg-red-400" },
];

function timeUntil(iso: string, locale: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(Math.max(minutes, 0), "minute");
  if (minutes < 24 * 60) return rtf.format(Math.round(minutes / 60), "hour");
  return rtf.format(Math.round(minutes / (24 * 60)), "day");
}

export default function OverviewTab({
  timezone,
  onOpenDay,
  refreshKey = 0,
  takeEarlyStats,
}: {
  timezone: string;
  onOpenDay: (date: string) => void;
  refreshKey?: number;
  // The numbers the dashboard page already asked for when it opened (once; null after that).
  takeEarlyStats?: () => Promise<BusinessStats> | null;
}) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const o = t.dashboard.overview;

  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let ignore = false;
    // Only the first load can use the early request; a refresh (new booking) always asks again.
    const early = refreshKey === 0 ? takeEarlyStats?.() : null;
    (early ?? api.get<BusinessStats>("/appointments/business/stats"))
      .then((data) => {
        if (!ignore) setStats(data);
      })
      .catch((err) => {
        if (!ignore) setError(err);
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, takeEarlyStats]);

  if (error) return <p className={errorBox}>{tError(error)}</p>;
  if (!stats) return <p className="text-sm text-ink-500">{o.loading}</p>;

  const { today, week, toConfirm, next } = stats;
  const maxDay = Math.max(1, ...week.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="relative overflow-hidden rounded-3xl bg-brand-700 p-6 text-white shadow-soft sm:p-8">
          <div aria-hidden="true" className="absolute -end-6 -top-6 grid grid-cols-3 gap-2 opacity-10">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className={`h-5 w-9 rounded ${i === 4 ? "bg-brand-300 opacity-100" : "bg-white"}`} />
            ))}
          </div>

          <h2 className="text-sm font-medium text-white/75">{o.next}</h2>
          {next ? (
            <NextAppointment
              next={next}
              timezone={timezone}
              today={stats.date}
              showStaff={user?.role === "owner"}
              onOpen={() =>
                onOpenDay(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(next.startTime)))
              }
            />
          ) : (
            <p className="mt-4 max-w-sm text-white/75">{o.noNext}</p>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <section className={`${card} p-5`}>
            <h2 className="text-sm text-ink-500">{o.todayCount}</h2>
            <p className="font-display tabular mt-1 text-3xl font-semibold">{today.total}</p>
            {today.total > 0 && (
              <>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                  {BAR.map(({ status, color }) =>
                    today.byStatus[status] ? (
                      <span
                        key={status}
                        className={color}
                        style={{ width: `${(today.byStatus[status] / today.total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                  {BAR.filter(({ status }) => today.byStatus[status]).map(({ status, color }) => (
                    <span key={status} className="inline-flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                      {t.status[status]} {today.byStatus[status]}
                    </span>
                  ))}
                </p>
              </>
            )}
          </section>

          <section
            className={`rounded-xl border p-5 ${toConfirm > 0 ? "border-brand-200 bg-brand-50" : "border-ink-100 bg-white"}`}
          >
            <h2 className={`text-sm ${toConfirm > 0 ? "text-brand-700" : "text-ink-500"}`}>{o.toConfirm}</h2>
            <p className="font-display tabular mt-1 text-3xl font-semibold">{toConfirm}</p>
            {toConfirm === 0 && <p className="mt-1 text-xs text-ink-500">{o.toConfirmNone}</p>}
          </section>

          <section className={`${card} p-5`}>
            <h2 className="text-sm text-ink-500">{o.revenue}</h2>
            <p dir="ltr" className="font-display tabular mt-1 text-3xl font-semibold rtl:text-right">
              {formatPrice(today.revenue)}
            </p>
            <p className="mt-1 text-xs text-ink-500">{o.revenueHint}</p>
          </section>
        </div>
      </div>

      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="font-display font-semibold">{o.week}</h2>
        <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-4">
          {week.map((d, i) => {
            const { weekday, day } = formatDayChip(d.date, t.locale);
            return (
              <button
                key={d.date}
                onClick={() => onOpenDay(d.date)}
                className="group flex flex-col items-center gap-2 rounded-lg p-1 text-center"
                aria-label={`${weekday} ${day}: ${t.dashboard.schedule.count(d.count)}`}
              >
                <span className="tabular text-sm font-semibold">{d.count}</span>
                <span className="flex h-28 w-full max-w-10 items-end rounded-lg bg-ink-50">
                  <span
                    className={`w-full rounded-lg transition group-hover:opacity-80 ${i === 0 ? "bg-brand-500" : "bg-brand-200"}`}
                    style={{ height: `${d.count ? Math.max((d.count / maxDay) * 100, 6) : 0}%` }}
                  />
                </span>
                <span className={`text-xs ${i === 0 ? "font-semibold text-ink-900" : "text-ink-500"}`}>
                  {i === 0 ? t.dashboard.schedule.today : weekday}
                </span>
                <span className="tabular -mt-2 text-xs text-ink-400">{day}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NextAppointment({
  next,
  timezone,
  today,
  showStaff,
  onOpen,
}: {
  next: NonNullable<BusinessStats["next"]>;
  timezone: string;
  today: string;
  showStaff: boolean;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const s = t.dashboard.schedule;
  const { date, time } = formatMomentIn(next.startTime, timezone, t.locale);
  const isToday = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(next.startTime)) === today;
  const name = next.guest?.name ?? next.customerId?.name ?? s.noCustomer;
  const phone = next.guest?.phone ?? next.customerId?.phone;

  return (
    <div className="relative">
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p dir="ltr" className="font-display tabular text-6xl font-semibold tracking-tight text-white sm:text-7xl">
          {time}
        </p>
        <p className="text-sm text-white/75">
          {!isToday && <span className="me-2 text-white">{date}</span>}
          {timeUntil(next.startTime, t.locale)}
        </p>
      </div>

      <p className="font-display mt-4 text-xl font-semibold">
        {name}
        {next.guest && (
          <span className="ms-2 rounded-full bg-white/15 px-2 py-0.5 align-middle font-sans text-xs font-medium text-white/75">
            {s.guest}
          </span>
        )}
      </p>
      <p className="mt-1 text-white/75">
        {next.serviceName}
        {showStaff && (
          <>
            {" "}
            {s.with} <span className="text-white">{next.staffId.name}</span>
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          {t.dashboard.overview.openDay}
          <IconChevron className="h-4 w-4 rtl:rotate-180" />
        </button>
        {phone && (
          <a
            href={`tel:${phone}`}
            dir="ltr"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <IconPhone className="h-4 w-4" />
            {phone}
          </a>
        )}
      </div>
    </div>
  );
}
