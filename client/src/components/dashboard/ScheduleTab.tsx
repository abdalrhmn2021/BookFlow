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
import type { AppointmentStatus, BusinessAppointment } from "@/lib/types";

// A mirror of the backend's ALLOWED_TRANSITIONS + time rules (appointment.controller).
// It only decides which buttons to SHOW - the backend still checks every request.
function nextStatuses(a: BusinessAppointment): AppointmentStatus[] {
  const started = new Date(a.startTime) <= new Date();
  if (a.status === "pending") return started ? [] : ["confirmed", "cancelled"];
  if (a.status === "confirmed") return started ? ["completed", "no-show"] : ["cancelled"];
  return []; // completed / cancelled / no-show are final
}

const FILTERS: (AppointmentStatus | "all")[] = ["all", "pending", "confirmed", "completed", "cancelled", "no-show"];

export default function ScheduleTab({ timezone }: { timezone: string }) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const s = t.dashboard.schedule;

  // "Today" in the BUSINESS's timezone (lazy initializer: calculated once, on the first render)
  const [date, setDate] = useState(() => todayIn(timezone));
  const [filter, setFilter] = useState<AppointmentStatus | "all">("all");
  const [reloadTick, setReloadTick] = useState(0);

  // Same "key" trick as the booking page: the result remembers which request it answers.
  const [result, setResult] = useState<{ key: string; list?: BusinessAppointment[]; error?: unknown } | null>(null);
  const key = `${date}|${filter}|${reloadTick}`;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
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
      await api.patch(`/appointments/${id}/status`, { status });
      // Change only this one item in the list (no reload needed)
      setResult((prev) =>
        prev?.list ? { ...prev, list: prev.list.map((a) => (a._id === id ? { ...a, status } : a)) } : prev
      );
      setConfirmCancelId(null);
    } catch (err) {
      setActionError({ id, err });
      // 409 = the appointment changed meanwhile (e.g. the customer cancelled it) -> load the fresh list
      if (err instanceof ApiError && err.status === 409) setReloadTick((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  };

  const today = todayIn(timezone);
  const list = current?.list ?? [];

  // Label + color of each action button
  const actionButton: Record<AppointmentStatus, { label: string; className: string }> = {
    confirmed: { label: s.confirm, className: "bg-green-600 text-white hover:bg-green-700" },
    completed: { label: s.complete, className: "bg-indigo-600 text-white hover:bg-indigo-700" },
    "no-show": { label: s.noShow, className: "border border-gray-300 bg-white hover:bg-gray-50" },
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
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
        {date === today && <span className="ms-2 text-sm font-normal text-indigo-600">({s.today})</span>}
      </h2>

      {/* ---- Status filter ---- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {f === "all" ? s.all : t.status[f]}
          </button>
        ))}
      </div>

      {/* ---- The list ---- */}
      <div className="mt-5">
        {!current ? (
          <p className="text-sm text-gray-500">{s.loading}</p>
        ) : current.error ? (
          <p className={errorBox}>{tError(current.error)}</p>
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            {s.empty}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">{s.count(list.length)}</p>
            <ul className="space-y-3">
              {list.map((a) => {
                const start = formatMomentIn(a.startTime, timezone, t.locale).time;
                const end = formatMomentIn(a.endTime, timezone, t.locale).time;
                const actions = nextStatuses(a);
                const busy = busyId === a._id;
                return (
                  <li key={a._id} className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4">
                    {/* Time column */}
                    <div dir="ltr" className="w-16 shrink-0 text-center">
                      <p className="font-semibold">{start}</p>
                      <p className="text-xs text-gray-400">{end}</p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{a.customerId?.name ?? s.noCustomer}</p>
                          <p className="text-sm text-gray-600">
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
                          {a.customerId?.phone && (
                            <a href={`tel:${a.customerId.phone}`} dir="ltr" className="text-sm text-indigo-600 hover:underline">
                              📞 {a.customerId.phone}
                            </a>
                          )}
                          {a.notes && <p className="mt-1 text-sm text-gray-500">📝 {a.notes}</p>}
                        </div>
                        <StatusBadge status={a.status} />
                      </div>

                      {actions.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {confirmCancelId === a._id ? (
                            // Cancelling is the only "dangerous" action -> ask first
                            <>
                              <span className="text-sm text-gray-600">{s.cancelQuestion}</span>
                              <button
                                onClick={() => changeStatus(a._id, "cancelled")}
                                disabled={busy}
                                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                              >
                                {s.yesCancel}
                              </button>
                              <button onClick={() => setConfirmCancelId(null)} disabled={busy} className="text-sm text-gray-600">
                                {s.keep}
                              </button>
                            </>
                          ) : (
                            actions.map((status) => (
                              <button
                                key={status}
                                disabled={busy}
                                onClick={() =>
                                  status === "cancelled" ? setConfirmCancelId(a._id) : changeStatus(a._id, status)
                                }
                                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${actionButton[status].className}`}
                              >
                                {actionButton[status].label}
                              </button>
                            ))
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
