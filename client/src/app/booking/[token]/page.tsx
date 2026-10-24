"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";
import StatusBadge from "@/components/StatusBadge";
import { formatDuration, formatMomentIn, formatPrice } from "@/lib/format";
import type { GuestBooking } from "@/lib/types";

const MIN_REASON_LENGTH = 10;

export default function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, tError } = useLanguage();

  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; err: unknown } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [justCancelled, setJustCancelled] = useState(false);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ booking: GuestBooking }>(`/public/bookings/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!ignore) setBooking(data.booking);
      })
      .catch((err) => {
        if (!ignore) setLoadError({ status: err instanceof ApiError ? err.status : 0, err });
      });
    return () => {
      ignore = true;
    };
  }, [token, reloadTick]);

  const handleCancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      const data = await api.patch<{ booking: GuestBooking }>(`/public/bookings/${encodeURIComponent(token)}/cancel`, {
        reason: reason.trim(),
      });
      setBooking(data.booking);
      setConfirming(false);
      setJustCancelled(true);
    } catch (err) {
      setCancelError(err);
      if (err instanceof ApiError && err.status === 409) setReloadTick((n) => n + 1);
    } finally {
      setCancelling(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {loadError.status === 404 ? t.manage.notFoundTitle : t.book.loadErrorTitle}
        </h1>
        <p className="mt-2 text-navy-500">{loadError.status === 404 ? t.manage.notFoundText : tError(loadError.err)}</p>
        <Link href="/" className="mt-6 inline-block font-medium text-brand-700 hover:underline">
          {t.common.backHome}
        </Link>
      </div>
    );
  }

  if (!booking) return <Loading />;

  const business = booking.business;
  const tz = business?.timezone ?? "UTC";
  const start = formatMomentIn(booking.startTime, tz, t.locale);
  const deadline = formatMomentIn(booking.cancelDeadline, tz, t.locale);
  const isActive = booking.status === "pending" || booking.status === "confirmed";

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t.manage.title}</h1>
      {booking.guestName && <p className="mt-1 text-navy-500">{t.manage.hi(booking.guestName)}</p>}

      {justCancelled && (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{t.manage.cancelledNow}</p>
      )}

      <div className="mt-6 rounded-xl border border-navy-100 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">{booking.serviceName}</p>
            <p className="mt-0.5 text-sm text-navy-600">
              {booking.staffName && (
                <>
                  {t.myAppointments.with} {booking.staffName}{" "}
                </>
              )}
              {business && (
                <>
                  {t.manage.at}{" "}
                  <Link href={`/book/${business.slug}`} className="font-medium text-brand-700 hover:underline">
                    {business.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-700">
          <span>📅 {start.date}</span>
          <span>🕒 {start.time}</span>
          <span>⏱ {formatDuration(booking.duration, t.duration)}</span>
          <span>💰 {formatPrice(booking.price)}</span>
        </div>
        <p className="mt-2 text-sm text-navy-500">
          📞 {t.manage.phone}: <span dir="ltr">{booking.guestPhone}</span>
        </p>
        {booking.notes && <p className="mt-1 text-sm text-navy-500">📝 {booking.notes}</p>}

        {booking.cancellation && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>
              {booking.cancellation.auto
                ? t.manage.autoClosed
                : booking.cancellation.byGuest
                  ? t.manage.cancelledByYou
                  : t.manage.cancelledByBusiness(business?.name ?? "")}
            </p>
            {booking.cancellation.reason && !booking.cancellation.auto && (
              <p className="mt-1">
                {t.manage.reason} {booking.cancellation.reason}
              </p>
            )}
          </div>
        )}

        {booking.canCancel ? (
          <div className="mt-5 border-t border-navy-100 pt-4">
            {confirming ? (
              <div className="space-y-3 rounded-lg bg-red-50 p-3 text-sm">
                <p className="font-medium text-red-800">{t.myAppointments.cancelQuestion}</p>
                <label className="block">
                  <span className="text-navy-700">{t.myAppointments.cancelReason}</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder={t.myAppointments.cancelReasonPlaceholder}
                    className="mt-1 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 outline-none focus:border-red-400"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={cancelling || reason.trim().length < MIN_REASON_LENGTH}
                    className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {cancelling ? t.myAppointments.cancelling : t.myAppointments.yesCancel}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={cancelling}
                    className="text-navy-600 hover:text-navy-900"
                  >
                    {t.myAppointments.keep}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-navy-500">{t.manage.cancelUntil(deadline.date, deadline.time)}</p>
                <button
                  onClick={() => {
                    setConfirming(true);
                    setCancelError(null);
                    setReason("");
                  }}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  {t.myAppointments.cancel}
                </button>
              </div>
            )}
          </div>
        ) : (
          isActive && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.manage.tooLate}</p>
        )}

        {cancelError !== null && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tError(cancelError)}</p>
        )}
      </div>

      {business && (
        <div className="mt-6 text-center">
          <Link
            href={`/book/${business.slug}`}
            className="inline-block rounded-lg border border-navy-200 px-4 py-2 font-medium hover:bg-navy-50"
          >
            {t.manage.bookAgain}
          </Link>
        </div>
      )}
    </div>
  );
}
