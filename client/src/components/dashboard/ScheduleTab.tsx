"use client";

// The daily schedule: every appointment of ONE day + buttons to move it through its statuses.
// Owner sees all staff; a staff member only gets his own (the backend filters it - not us).

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import StatusBadge from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { addDays, formatLongDate, formatMomentIn, formatPrice, todayIn } from "@/lib/format";
import { btnSecondary, errorBox } from "@/lib/ui";
import { toWhatsAppNumber, whatsAppLink } from "@/lib/whatsapp";
import type { AppointmentStatus, BusinessAppointment } from "@/lib/types";

// A guest booking keeps its phone on the appointment itself; a customer's is on the account
const phoneOf = (a: BusinessAppointment) => a.guest?.phone ?? a.customerId?.phone;
const nameOf = (a: BusinessAppointment) => a.guest?.name ?? a.customerId?.name;

// Same rule as the backend's markReminded: still active AND still in the future
const canRemind = (a: BusinessAppointment) =>
  (a.status === "pending" || a.status === "confirmed") && new Date(a.startTime) > new Date();

// Same minimum as the backend (MIN_REASON_LENGTH in appointment.controller)
const MIN_REASON_LENGTH = 10;

// A mirror of the backend's ALLOWED_TRANSITIONS + time rules (appointment.controller).
// It only decides which buttons to SHOW - the backend still checks every request.
function nextStatuses(a: BusinessAppointment): AppointmentStatus[] {
  const started = new Date(a.startTime) <= new Date();
  if (a.status === "pending") return started ? [] : ["confirmed", "cancelled"];
  if (a.status === "confirmed") return started ? ["completed", "no-show"] : ["cancelled"];
  return []; // completed / cancelled / no-show are final
}

const FILTERS: (AppointmentStatus | "all")[] = ["all", "pending", "confirmed", "completed", "cancelled", "no-show"];

export default function ScheduleTab({ timezone, initialDate }: { timezone: string; initialDate?: string }) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const s = t.dashboard.schedule;

  // "Today" in the BUSINESS's timezone (lazy initializer: calculated once, on the first render)
  // initialDate: the overview opens the schedule on the day it was showing
  const [date, setDate] = useState(() => initialDate ?? todayIn(timezone));
  const [filter, setFilter] = useState<AppointmentStatus | "all">("all");
  const [reloadTick, setReloadTick] = useState(0);

  // Same "key" trick as the booking page: the result remembers which request it answers.
  const [result, setResult] = useState<{ key: string; list?: BusinessAppointment[]; error?: unknown } | null>(null);
  const key = `${date}|${filter}|${reloadTick}`;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<{ id: string; err: unknown } | null>(null);

  useEffect(() => {
    const requestKey = `${date}|${filter}|${reloadTick}`;
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
  }, [date, filter, reloadTick]);

  const current = result?.key === key ? result : null; // null -> loading

  const changeStatus = async (id: string, status: AppointmentStatus) => {
    setActionError(null);
    setBusyId(id);
    try {
      // Cancelling needs a reason (the backend refuses without one)
      await api.patch(`/appointments/${id}/status`, status === "cancelled" ? { status, reason: cancelReason.trim() } : { status });
      // Change only this one item in the list (no reload needed)
      setResult((prev) =>
        prev?.list ? { ...prev, list: prev.list.map((a) => (a._id === id ? { ...a, status } : a)) } : prev
      );
      setConfirmCancelId(null);
      setCancelReason("");
    } catch (err) {
      setActionError({ id, err });
      // 409 = the appointment changed meanwhile (e.g. the customer cancelled it) -> load the fresh list
      if (err instanceof ApiError && err.status === 409) setReloadTick((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  };

  // Called when the WhatsApp link is clicked. The link itself opens WhatsApp (a normal <a>,
  // so the browser never blocks it as a popup) - here we only RECORD that it was sent.
  const markReminded = async (id: string) => {
    setActionError(null);
    try {
      const { reminderSentAt } = await api.patch<{ reminderSentAt: string }>(`/appointments/${id}/reminded`);
      setResult((prev) =>
        prev?.list ? { ...prev, list: prev.list.map((a) => (a._id === id ? { ...a, reminderSentAt } : a)) } : prev
      );
    } catch (err) {
      setActionError({ id, err });
    }
  };

  const today = todayIn(timezone);
  const list = current?.list ?? [];

  // The ready-made reminder text. "today" / "tomorrow" read better than a date.
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

  // Label + color of each action button
  const actionButton: Record<AppointmentStatus, { label: string; className: string }> = {
    confirmed: { label: s.confirm, className: "bg-green-600 text-white hover:bg-green-700" },
    completed: { label: s.complete, className: "bg-ink-900 text-white hover:bg-ink-950" },
    "no-show": { label: s.noShow, className: "border border-slate-300 bg-white hover:bg-slate-50" },
    cancelled: { label: s.cancel, className: "border border-red-200 bg-white text-red-600 hover:bg-red-50" },
    pending: { label: "", className: "" }, // never a target
  };

  return (
    <div>
      {/* ---- Day navigation ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* rtl:rotate-180 -> the arrow points the right way in Arabic too */}
        <button onClick={() => setDate(addDays(date, -1))} className={btnSecondary} title={s.prevDay}>
          <span className="inline-block rtl:rotate-180">‹</span>
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button onClick={() => setDate(addDays(date, 1))} className={btnSecondary} title={s.nextDay}>
          <span className="inline-block rtl:rotate-180">›</span>
        </button>
        {date !== today && (
          <button onClick={() => setDate(today)} className={btnSecondary}>
            {s.today}
          </button>
        )}
      </div>
      <h2 className="mt-4 text-lg font-semibold">
        {formatLongDate(date, t.locale)}
        {date === today && <span className="ms-2 text-sm font-normal text-ink-900">({s.today})</span>}
      </h2>

      {/* ---- Status filter ---- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? s.all : t.status[f]}
          </button>
        ))}
      </div>

      {/* ---- The list ---- */}
      <div className="mt-5">
        {!current ? (
          <p className="text-sm text-slate-500">{s.loading}</p>
        ) : current.error ? (
          <p className={errorBox}>{tError(current.error)}</p>
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {s.empty}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">{s.count(list.length)}</p>
            <ul className="space-y-3">
              {list.map((a) => {
                const start = formatMomentIn(a.startTime, timezone, t.locale).time;
                const end = formatMomentIn(a.endTime, timezone, t.locale).time;
                const actions = nextStatuses(a);
                const busy = busyId === a._id;
                return (
                  <li key={a._id} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
                    {/* Time column */}
                    <div dir="ltr" className="w-16 shrink-0 text-center">
                      <p className="font-semibold">{start}</p>
                      <p className="text-xs text-slate-400">{end}</p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {/* Who booked: a guest (name + phone only) or a customer account */}
                          <p className="flex items-center gap-2 font-semibold">
                            {a.guest ? a.guest.name : (a.customerId?.name ?? s.noCustomer)}
                            {a.guest && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                {s.guest}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-slate-600">
                            {a.serviceName}
                            {/* The owner sees everyone's appointments -> show WHO does it */}
                            {user?.role === "owner" && (
                              <>
                                {" "}
                                {s.with} <b className="font-medium">{a.staffId.name}</b>
                              </>
                            )}
                            {" · "}
                            {formatPrice(a.price)}
                          </p>
                          {phoneOf(a) && (
                            <a href={`tel:${phoneOf(a)}`} dir="ltr" className="text-sm text-ink-900 hover:underline">
                              📞 {phoneOf(a)}
                            </a>
                          )}
                          {a.notes && <p className="mt-1 text-sm text-slate-500">📝 {a.notes}</p>}
                        </div>
                        <StatusBadge status={a.status} />
                      </div>

                      {actions.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {confirmCancelId === a._id ? (
                            // Cancelling is the only "dangerous" action -> ask first
                            <div className="w-full space-y-2">
                              <p className="text-sm text-slate-600">{s.cancelQuestion}</p>
                              <label className="block">
                                <span className="text-xs font-medium text-slate-600">{s.cancelReason}</span>
                                <input
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  maxLength={300}
                                  placeholder={s.cancelReasonPlaceholder}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                />
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => changeStatus(a._id, "cancelled")}
                                  disabled={busy || cancelReason.trim().length < MIN_REASON_LENGTH}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                                >
                                  {s.yesCancel}
                                </button>
                                <button onClick={() => setConfirmCancelId(null)} disabled={busy} className="text-sm text-slate-600">
                                  {s.keep}
                                </button>
                              </div>
                            </div>
                          ) : (
                            actions.map((status) => (
                              <button
                                key={status}
                                disabled={busy}
                                onClick={() => {
                                  if (status !== "cancelled") return changeStatus(a._id, status);
                                  setConfirmCancelId(a._id); // ask first + start with an empty reason
                                  setCancelReason("");
                                }}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${actionButton[status].className}`}
                              >
                                {actionButton[status].label}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {/* WhatsApp reminder - only when it still makes sense and we have a usable number */}
                      {canRemind(a) && toWhatsAppNumber(phoneOf(a)) && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <a
                            href={whatsAppLink(toWhatsAppNumber(phoneOf(a))!, reminderText(a))}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markReminded(a._id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z" />
                            </svg>
                            {a.reminderSentAt ? s.remindAgain : s.remind}
                          </a>
                          {a.reminderSentAt && (
                            <span className="text-xs text-green-700">
                              ✓ {s.reminded(formatMomentIn(a.reminderSentAt, timezone, t.locale).time)}
                            </span>
                          )}
                        </div>
                      )}
                      {actionError?.id === a._id && <p className={`mt-2 ${errorBox}`}>{tError(actionError.err)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
