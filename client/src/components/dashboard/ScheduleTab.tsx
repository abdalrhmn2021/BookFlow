"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import StatusBadge from "@/components/StatusBadge";
import BookingForm, { type BookingFormMode } from "@/components/dashboard/BookingForm";
import { api, ApiError } from "@/lib/api";
import { addDays, formatDayChip, formatLongDate, formatMomentIn, formatPrice, todayIn } from "@/lib/format";
import { IconChevron, IconNote, IconPhone, IconWhatsApp } from "@/components/icons";
import { btnPrimary, btnSecondary, emptyBox, errorBox } from "@/lib/ui";
import { toWhatsAppNumber, whatsAppLink } from "@/lib/whatsapp";
import type { AppointmentStatus, BusinessAppointment, UpcomingBookings } from "@/lib/types";

const phoneOf = (a: BusinessAppointment) => a.guest?.phone ?? a.customerId?.phone;
const nameOf = (a: BusinessAppointment) => a.guest?.name ?? a.customerId?.name;

const canRemind = (a: BusinessAppointment) =>
  (a.status === "pending" || a.status === "confirmed") && new Date(a.startTime) > new Date();

const MIN_REASON_LENGTH = 10;

// Mirrors the API's allowed transitions; only decides which buttons to show.
function nextStatuses(a: BusinessAppointment): AppointmentStatus[] {
  const started = new Date(a.startTime) <= new Date();
  if (a.status === "pending") return started ? ["completed", "no-show"] : ["confirmed", "cancelled"];
  if (a.status === "confirmed") return started ? ["completed", "no-show"] : ["cancelled"];
  return [];
}

const FILTERS: (AppointmentStatus | "all")[] = ["all", "pending", "confirmed", "completed", "cancelled", "no-show"];

// The strip of days under the header: today and the next two weeks.
const STRIP_DAYS = 14;
// How many of the next bookings to show when the chosen day is empty.
const UPCOMING_SHOWN = 5;

export default function ScheduleTab({
  timezone,
  slug,
  initialDate,
  refreshKey = 0,
}: {
  timezone: string;
  slug: string;
  initialDate?: string;
  refreshKey?: number;
}) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const s = t.dashboard.schedule;

  const [date, setDate] = useState(() => initialDate ?? todayIn(timezone));
  const [filter, setFilter] = useState<AppointmentStatus | "all">("all");
  const [reloadTick, setReloadTick] = useState(0);

  const [result, setResult] = useState<{ key: string; list?: BusinessAppointment[]; error?: unknown } | null>(null);
  const key = `${date}|${filter}|${reloadTick}|${refreshKey}`;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<{ id: string; err: unknown } | null>(null);
  const [form, setForm] = useState<BookingFormMode | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingBookings | null>(null);
  const [upcomingTick, setUpcomingTick] = useState(0);

  useEffect(() => {
    const requestKey = `${date}|${filter}|${reloadTick}|${refreshKey}`;
    let ignore = false;
    const query = new URLSearchParams({ date });
    if (filter !== "all") query.set("status", filter);

    api
      .get<{ appointments: BusinessAppointment[] }>(`/appointments/business?${query}`)
      .then((data) => {
        if (!ignore) setResult({ key: requestKey, list: data.appointments });
      })
      .catch((err) => {
        if (!ignore) setResult({ key: requestKey, error: err });
      });
    return () => {
      ignore = true;
    };
  }, [date, filter, reloadTick, refreshKey]);

  // Which days ahead have bookings (for the strip) and the next few (for an empty day).
  useEffect(() => {
    let ignore = false;
    api
      .get<UpcomingBookings>("/appointments/business/upcoming")
      .then((data) => {
        if (!ignore) setUpcoming(data);
      })
      .catch(() => {}); // only a helper: the day's list still works without it
    return () => {
      ignore = true;
    };
  }, [reloadTick, refreshKey, upcomingTick]);

  const current = result?.key === key ? result : null;

  const changeStatus = async (id: string, status: AppointmentStatus) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(
        `/appointments/${id}/status`,
        status === "cancelled" ? { status, reason: cancelReason.trim() } : { status },
      );
      setResult((prev) =>
        prev?.list ? { ...prev, list: prev.list.map((a) => (a._id === id ? { ...a, status } : a)) } : prev,
      );
      setConfirmCancelId(null);
      setCancelReason("");
      setUpcomingTick((n) => n + 1);
    } catch (err) {
      setActionError({ id, err });
      if (err instanceof ApiError && err.status === 409) setReloadTick((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  };

  const markReminded = async (id: string) => {
    setActionError(null);
    try {
      const { reminderSentAt } = await api.patch<{ reminderSentAt: string }>(`/appointments/${id}/reminded`);
      setResult((prev) =>
        prev?.list ? { ...prev, list: prev.list.map((a) => (a._id === id ? { ...a, reminderSentAt } : a)) } : prev,
      );
    } catch (err) {
      setActionError({ id, err });
    }
  };

  const today = todayIn(timezone);
  const list = current?.list ?? [];
  const localDateOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
  const countOn = new Map((upcoming?.days ?? []).map((d) => [d.date, d.count]));
  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i));
  const nextOnes = (upcoming?.appointments ?? []).slice(0, UPCOMING_SHOWN);

  const reminderText = (a: BusinessAppointment) => {
    const apptDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(a.startTime));
    const day =
      apptDate === today
        ? s.dayToday
        : apptDate === addDays(today, 1)
          ? s.dayTomorrow
          : s.dayOn(formatLongDate(apptDate, t.locale));
    return s.reminderMessage({
      name: nameOf(a) ?? "",
      business: user?.business?.name ?? "",
      day,
      time: formatMomentIn(a.startTime, timezone, t.locale).time,
      service: a.serviceName,
      staff: a.staffId.name,
    });
  };

  const actionButton: Record<AppointmentStatus, { label: string; className: string }> = {
    confirmed: { label: s.confirm, className: "bg-navy-900 text-white hover:bg-navy-700" },
    completed: { label: s.complete, className: "bg-navy-900 text-white hover:bg-navy-700" },
    "no-show": { label: s.noShow, className: "border border-navy-200 bg-white text-navy-800 hover:bg-navy-50" },
    cancelled: { label: s.cancel, className: "text-red-700 hover:bg-red-50" },
    pending: { label: "", className: "" },
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(addDays(date, -1))}
            className={`${btnSecondary} px-2.5`}
            aria-label={s.prevDay}
            title={s.prevDay}
          >
            <IconChevron className="h-4 w-4 rotate-180 rtl:rotate-0" />
          </button>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className={`${btnSecondary} px-2.5`}
            aria-label={s.nextDay}
            title={s.nextDay}
          >
            <IconChevron className="h-4 w-4 rtl:rotate-180" />
          </button>
          <h2 className="font-display ms-2 text-lg font-semibold">
            {formatLongDate(date, t.locale)}
            {date === today && (
              <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 align-middle font-sans text-xs font-medium text-brand-700">
                {s.today}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setForm({ kind: "new", date: date < today ? today : date })} className={btnPrimary}>
            + {t.dashboard.booking.newButton}
          </button>
          {date !== today && (
            <button onClick={() => setDate(today)} className={btnSecondary}>
              {s.today}
            </button>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label={s.today}
            className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div role="group" aria-label={s.upcomingDays} className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {strip.map((d) => {
          const chip = formatDayChip(d, t.locale);
          const count = countOn.get(d) ?? 0;
          const selected = d === date;
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={selected}
              aria-label={`${formatLongDate(d, t.locale)}${count ? ` - ${s.count(count)}` : ""}`}
              className={`relative flex w-12 shrink-0 flex-col items-center rounded-xl border px-1 py-1.5 text-xs transition ${
                selected
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              <span>{chip.weekday}</span>
              <span className="tabular text-base font-semibold">{chip.day}</span>
              {count > 0 && (
                <span
                  className={`tabular mt-0.5 min-w-5 rounded-full px-1 text-[11px] font-semibold ${
                    selected ? "bg-white text-navy-900" : "bg-brand-500 text-white"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-navy-100/60 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900"
            }`}
          >
            {f === "all" ? s.all : t.status[f]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {!current ? (
          <p className="text-sm text-navy-500">{s.loading}</p>
        ) : current.error ? (
          <p className={errorBox}>{tError(current.error)}</p>
        ) : list.length === 0 ? (
          <>
            <p className={emptyBox}>{s.empty}</p>
            {filter === "all" && upcoming && (
              <section className="mt-6">
                <h3 className="font-display text-base font-semibold">{s.upcomingTitle}</h3>
                {nextOnes.length === 0 ? (
                  <p className="mt-2 text-sm text-navy-500">{s.upcomingNone}</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-navy-500">{s.upcomingHint}</p>
                    <ul className="mt-3 space-y-2">
                      {nextOnes.map((a) => {
                        const when = formatMomentIn(a.startTime, timezone, t.locale);
                        return (
                          <li key={a._id}>
                            <button
                              onClick={() => setDate(localDateOf(a.startTime))}
                              className="flex w-full items-center gap-3 rounded-xl border border-navy-100 bg-white p-3 text-start transition hover:border-navy-300"
                            >
                              <span className="w-24 shrink-0 text-sm">
                                <span className="block text-navy-500">{when.date}</span>
                                <span dir="ltr" className="tabular font-semibold text-navy-900">
                                  {when.time}
                                </span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{nameOf(a) ?? s.noCustomer}</span>
                                <span className="block truncate text-sm text-navy-600">
                                  {a.serviceName}
                                  {user?.role === "owner" && ` ${s.with} ${a.staffId.name}`}
                                </span>
                              </span>
                              <StatusBadge status={a.status} />
                              <IconChevron className="h-4 w-4 shrink-0 text-navy-400 rtl:rotate-180" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {upcoming.total > nextOnes.length && (
                      <p className="mt-2 text-sm text-navy-500">{s.upcomingMore(upcoming.total - nextOnes.length)}</p>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-navy-500">{s.count(list.length)}</p>
            <ol className="relative">
              {list.map((a, i) => {
                const start = formatMomentIn(a.startTime, timezone, t.locale).time;
                const end = formatMomentIn(a.endTime, timezone, t.locale).time;
                const actions = nextStatuses(a);
                const busy = busyId === a._id;
                const finished = a.status === "completed" || a.status === "cancelled" || a.status === "no-show";
                return (
                  <li key={a._id} className="relative flex gap-3 pb-4 sm:gap-5">
                    <div dir="ltr" className="tabular w-12 shrink-0 pt-4 text-end sm:w-14">
                      <p className="font-semibold text-navy-900">{start}</p>
                      <p className="text-xs text-navy-400">{end}</p>
                    </div>
                    <div aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
                      {i < list.length - 1 && <span className="absolute top-6 -bottom-4 w-px bg-navy-200" />}
                      <span
                        className={`relative mt-5 h-3 w-3 rounded-full ring-4 ring-navy-50 ${
                          finished ? "bg-navy-300" : a.status === "pending" ? "bg-amber-400" : "bg-brand-500"
                        }`}
                      />
                    </div>

                    <div
                      className={`min-w-0 flex-1 rounded-xl border border-navy-100 bg-white p-4 ${finished ? "opacity-75" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-semibold">
                            {nameOf(a) ?? s.noCustomer}
                            {a.guest && (
                              <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-600">
                                {s.guest}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm text-navy-600">
                            {a.serviceName}
                            {user?.role === "owner" && (
                              <>
                                {" "}
                                {s.with} <span className="font-medium text-navy-900">{a.staffId.name}</span>
                              </>
                            )}
                            <span className="tabular ms-2 text-navy-400">
                              <bdi>{formatPrice(a.price)}</bdi>
                            </span>
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {phoneOf(a) && (
                              <a
                                href={`tel:${phoneOf(a)}`}
                                dir="ltr"
                                className="inline-flex items-center gap-1.5 text-navy-700 hover:text-brand-700"
                              >
                                <IconPhone className="h-4 w-4" />
                                {phoneOf(a)}
                              </a>
                            )}
                            {a.notes && (
                              <span className="inline-flex items-start gap-1.5 text-navy-500">
                                <IconNote className="mt-0.5 h-4 w-4 shrink-0" />
                                {a.notes}
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>

                      {(actions.length > 0 || canRemind(a)) && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-navy-50 pt-3">
                          {confirmCancelId === a._id ? (
                            <div className="w-full space-y-2">
                              <p className="text-sm text-navy-600">{s.cancelQuestion}</p>
                              <label className="block">
                                <span className="text-xs font-medium text-navy-600">{s.cancelReason}</span>
                                <input
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  maxLength={300}
                                  placeholder={s.cancelReasonPlaceholder}
                                  className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
                                />
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => changeStatus(a._id, "cancelled")}
                                  disabled={busy || cancelReason.trim().length < MIN_REASON_LENGTH}
                                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {s.yesCancel}
                                </button>
                                <button
                                  onClick={() => setConfirmCancelId(null)}
                                  disabled={busy}
                                  className="rounded-md px-3 py-1.5 text-sm text-navy-600 hover:bg-navy-50"
                                >
                                  {s.keep}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {actions.map((status) => (
                                <button
                                  key={status}
                                  disabled={busy}
                                  onClick={() => {
                                    if (status !== "cancelled") return changeStatus(a._id, status);
                                    setConfirmCancelId(a._id);
                                    setCancelReason("");
                                  }}
                                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${actionButton[status].className}`}
                                >
                                  {actionButton[status].label}
                                </button>
                              ))}
                              {canRemind(a) && (
                                <button
                                  disabled={busy}
                                  onClick={() => setForm({ kind: "move", appointment: a })}
                                  className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-sm font-medium text-navy-800 transition hover:bg-navy-50 disabled:opacity-50"
                                >
                                  {t.dashboard.booking.moveButton}
                                </button>
                              )}
                              {canRemind(a) && toWhatsAppNumber(phoneOf(a)) && (
                                <span className="ms-auto inline-flex flex-wrap items-center gap-2">
                                  {a.reminderSentAt && (
                                    <span className="text-xs text-emerald-700">
                                      ✓{" "}
                                      {(a.reminderChannel === "whatsapp" ? s.remindedAuto : s.reminded)(
                                        formatMomentIn(a.reminderSentAt, timezone, t.locale).time,
                                      )}
                                    </span>
                                  )}
                                  <a
                                    href={whatsAppLink(toWhatsAppNumber(phoneOf(a))!, reminderText(a))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => markReminded(a._id)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                                  >
                                    <IconWhatsApp />
                                    {a.reminderSentAt ? s.remindAgain : s.remind}
                                  </a>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {actionError?.id === a._id && <p className={`mt-2 ${errorBox}`}>{tError(actionError.err)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {form && (
        <BookingForm
          mode={form}
          slug={slug}
          timezone={timezone}
          onClose={() => setForm(null)}
          onSaved={(savedDate) => {
            setDate(savedDate);
            setReloadTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
