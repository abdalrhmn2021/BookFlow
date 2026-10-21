"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { formatDuration, formatMomentIn, formatPrice } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { IconCalendar, IconClock, IconNote } from "@/components/icons";
import type { MyAppointment } from "@/lib/types";

export default function MyAppointmentsPage() {
  return (
    <RequireAuth roles={["customer"]}>
      <Content />
    </RequireAuth>
  );
}

const MIN_REASON_LENGTH = 10;

function isUpcoming(a: MyAppointment): boolean {
  return (a.status === "pending" || a.status === "confirmed") && new Date(a.startTime) > new Date();
}

function Content() {
  const { t, tError } = useLanguage();
  const { bookHref, isSingleBusiness } = useBrand();

  const [appointments, setAppointments] = useState<MyAppointment[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; err: unknown } | null>(null);
  const [reason, setReason] = useState("");

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
      await api.patch(`/appointments/${id}/cancel`, { reason: reason.trim() });
      setAppointments((prev) => (prev ? prev.map((a) => (a._id === id ? { ...a, status: "cancelled" } : a)) : prev));
      setConfirmingId(null);
      setReason("");
    } catch (err) {
      setCancelError({ id, err });
    } finally {
      setCancellingId(null);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <p className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{tError(loadError)}</p>
      </Shell>
    );
  }

  if (!appointments) {
    return (
      <Shell>
        <p className="mt-8 text-navy-500">{t.myAppointments.loading}</p>
      </Shell>
    );
  }

  const upcoming = appointments.filter(isUpcoming);
  const past = appointments.filter((a) => !isUpcoming(a)).reverse();

  if (appointments.length === 0) {
    return (
      <Shell>
        <div className="mt-8 rounded-xl border border-dashed border-navy-200 bg-white px-6 py-12 text-center">
          <p className="font-medium">{t.myAppointments.emptyTitle}</p>
          <p className="mt-1 text-sm text-navy-500">{t.myAppointments.emptyText}</p>
          <Link
            href={bookHref}
            className="mt-5 inline-block rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-brand-ink transition hover:bg-brand-400"
          >
            {isSingleBusiness ? t.nav.book : t.myAppointments.browse}
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
          <p className="mt-3 text-sm text-navy-500">
            {t.myAppointments.nothingUpcoming}{" "}
            <Link href={bookHref} className="font-medium text-brand-700 hover:underline">
              {t.myAppointments.bookSomething}
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a._id} a={a}>
                <div className="mt-4 border-t border-navy-100 pt-3">
                  {confirmingId === a._id ? (
                    <div className="space-y-2 text-sm">
                      <p className="text-navy-600">{t.myAppointments.cancelQuestion}</p>
                      <label className="block">
                        <span className="text-xs font-medium text-navy-600">{t.myAppointments.cancelReason}</span>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={300}
                          placeholder={t.myAppointments.cancelReasonPlaceholder}
                          className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-1.5 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleCancel(a._id)}
                          disabled={cancellingId === a._id || reason.trim().length < MIN_REASON_LENGTH}
                          className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {cancellingId === a._id ? t.myAppointments.cancelling : t.myAppointments.yesCancel}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          disabled={cancellingId === a._id}
                          className="text-navy-600 hover:text-navy-900"
                        >
                          {t.myAppointments.keep}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirmingId(a._id);
                        setCancelError(null);
                        setReason("");
                      }}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      {t.myAppointments.cancel}
                    </button>
                  )}
                  {cancelError?.id === a._id && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
          <h2 className="text-lg font-semibold text-navy-500">{t.myAppointments.past(past.length)}</h2>
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

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { bookHref } = useBrand();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t.myAppointments.title}</h1>
          <p className="mt-1 text-navy-500">{t.myAppointments.hi(user?.name ?? "")}</p>
        </div>
        <Link href={bookHref} className="text-sm font-medium text-brand-700 hover:underline">
          {t.myAppointments.newBooking}
        </Link>
      </div>
      {children}
    </div>
  );
}

function AppointmentCard({ a, children }: { a: MyAppointment; children?: React.ReactNode }) {
  const { t } = useLanguage();
  const { date, time } = formatMomentIn(a.startTime, a.tenantId.timezone, t.locale);
  return (
    <li className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{a.serviceName}</p>
          <p className="mt-0.5 text-sm text-navy-600">
            {t.myAppointments.with} {a.staffId.name} {t.myAppointments.at}{" "}
            <Link href={`/book/${a.tenantId.slug}`} className="font-medium text-brand-700 hover:underline">
              {a.tenantId.name}
            </Link>
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-navy-700">
        <span className="inline-flex items-center gap-1.5">
          <IconCalendar className="h-4 w-4 text-navy-400" />
          {date}
        </span>
        <span className="tabular inline-flex items-center gap-1.5 font-semibold text-navy-900">
          <IconClock className="h-4 w-4 text-navy-400" />
          {time}
        </span>
        <span className="text-navy-500">{formatDuration(a.duration, t.duration)}</span>
        <span dir="ltr" className="tabular text-navy-500">
          {formatPrice(a.price)}
        </span>
      </div>
      {a.notes && (
        <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-navy-500">
          <IconNote className="mt-0.5 h-4 w-4 shrink-0" />
          {a.notes}
        </p>
      )}
      {children}
    </li>
  );
}
