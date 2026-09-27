"use client";

// The customer's bookings, at every business they booked with.
//   Upcoming: pending/confirmed AND still in the future  -> can be cancelled
//   Past:     everything else (done, cancelled, no-show, or time already passed)

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { formatDuration, formatMomentIn, formatPrice } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import type { MyAppointment } from "@/lib/types";

export default function MyAppointmentsPage() {
  return (
    <RequireAuth roles={["customer"]}>
      <Content />
    </RequireAuth>
  );
}

// Same rule as the backend's cancelMyAppointment: active status + not started yet.
// (The backend checks it again anyway - this only decides whether to SHOW the button.)
function isUpcoming(a: MyAppointment): boolean {
  return (a.status === "pending" || a.status === "confirmed") && new Date(a.startTime) > new Date();
}

function Content() {
  const { t, tError } = useLanguage();

  // null = still loading. An empty array means "loaded, but you have no bookings".
  const [appointments, setAppointments] = useState<MyAppointment[] | null>(null);
  // Errors are stored as-is and translated at render time (so a language switch re-translates them)
  const [loadError, setLoadError] = useState<unknown>(null);

  // Cancelling is 2 clicks: "Cancel" -> "Yes, cancel". One accidental click can't lose a booking.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; err: unknown } | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ appointments: MyAppointment[] }>("/appointments/me")
      .then((data) => {
        if (!ignore) setAppointments(data.appointments);
      })
      .catch((err) => {
        if (!ignore) setLoadError(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleCancel = async (id: string) => {
    setCancelError(null);
    setCancellingId(id);
    try {
      await api.patch(`/appointments/${id}/cancel`);
      // Update ONLY the status in our list - no need to reload everything.
      // (The response's appointment is not populated, so we keep our own copy
      //  with the business/staff names and just change the status.)
      // prev => ... : always based on the LATEST list, even if it changed meanwhile.
      setAppointments((prev) =>
        prev ? prev.map((a) => (a._id === id ? { ...a, status: "cancelled" } : a)) : prev
      );
      setConfirmingId(null);
    } catch (err) {
      // e.g. 409 "Can't cancel an appointment that is completed" (the business changed it meanwhile)
      setCancelError({ id, err });
    } finally {
      setCancellingId(null);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <p className="mt-8 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{tError(loadError)}</p>
      </Shell>
    );
  }

  if (!appointments) {
    return (
      <Shell>
        <p className="mt-8 text-gray-500">{t.myAppointments.loading}</p>
      </Shell>
    );
  }

  const upcoming = appointments.filter(isUpcoming); // backend sorts oldest first = soonest first ✓
  const past = appointments.filter((a) => !isUpcoming(a)).reverse(); // most recent first

  if (appointments.length === 0) {
    return (
      <Shell>
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="font-medium">{t.myAppointments.emptyTitle}</p>
          <p className="mt-1 text-sm text-gray-500">{t.myAppointments.emptyText}</p>
          <Link
            href="/businesses"
            className="mt-5 inline-block rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            {t.myAppointments.browse}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.myAppointments.upcoming(upcoming.length)}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            {t.myAppointments.nothingUpcoming}{" "}
            <Link href="/businesses" className="font-medium text-indigo-600 hover:underline">
              {t.myAppointments.bookSomething}
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a._id} a={a}>
                {/* The cancel area - its own little state machine: button -> confirm -> cancelling */}
                <div className="mt-4 border-t border-gray-100 pt-3">
                  {confirmingId === a._id ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-gray-600">{t.myAppointments.cancelQuestion}</span>
                      <button
                        onClick={() => handleCancel(a._id)}
                        disabled={cancellingId === a._id}
                        className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {cancellingId === a._id ? t.myAppointments.cancelling : t.myAppointments.yesCancel}
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        disabled={cancellingId === a._id}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        {t.myAppointments.keep}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirmingId(a._id);
                        setCancelError(null);
                      }}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      {t.myAppointments.cancel}
                    </button>
                  )}
                  {cancelError?.id === a._id && (
                    <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                      {tError(cancelError.err)}
                    </p>
                  )}
                </div>
              </AppointmentCard>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-500">{t.myAppointments.past(past.length)}</h2>
          <ul className="mt-3 space-y-3 opacity-80">
            {past.map((a) => (
              <AppointmentCard key={a._id} a={a} />
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

// ---------- Building blocks ----------

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t.myAppointments.title}</h1>
          <p className="mt-1 text-gray-500">{t.myAppointments.hi(user?.name ?? "")}</p>
        </div>
        <Link href="/businesses" className="text-sm font-medium text-indigo-600 hover:underline">
          {t.myAppointments.newBooking}
        </Link>
      </div>
      {children}
    </div>
  );
}

function AppointmentCard({ a, children }: { a: MyAppointment; children?: React.ReactNode }) {
  const { t } = useLanguage();
  // Show the time in the BUSINESS's timezone - that's where the customer has to show up
  const { date, time } = formatMomentIn(a.startTime, a.tenantId.timezone, t.locale);
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{a.serviceName}</p>
          <p className="mt-0.5 text-sm text-gray-600">
            {t.myAppointments.with} {a.staffId.name} {t.myAppointments.at}{" "}
            <Link href={`/book/${a.tenantId.slug}`} className="font-medium text-indigo-600 hover:underline">
              {a.tenantId.name}
            </Link>
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
        <span>📅 {date}</span>
        <span>🕒 {time}</span>
        <span>⏱ {formatDuration(a.duration, t.duration)}</span>
        <span>💰 {formatPrice(a.price)}</span>
      </div>
      {a.notes && <p className="mt-2 text-sm text-gray-500">📝 {a.notes}</p>}
      {children}
    </li>
  );
}
