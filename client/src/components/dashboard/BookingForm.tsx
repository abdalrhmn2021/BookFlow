"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { IconWhatsApp } from "@/components/icons";
import { api } from "@/lib/api";
import { addDays, formatLongDate, formatMomentIn, todayIn } from "@/lib/format";
import { btnPrimary, btnSecondary, errorBox, inputClass } from "@/lib/ui";
import { toWhatsAppNumber, whatsAppLink } from "@/lib/whatsapp";
import { offersService, type Availability, type BusinessAppointment, type PublicBusinessPage } from "@/lib/types";

export type BookingFormMode = { kind: "new"; date: string } | { kind: "move"; appointment: BusinessAppointment };

const localDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

// One form for both jobs: a walk-in / phone booking, and moving an appointment to another time.
// onSaved(date) tells the schedule which day to show afterwards.
export default function BookingForm({
  mode,
  slug,
  timezone,
  onSaved,
  onClose,
}: {
  mode: BookingFormMode;
  slug: string;
  timezone: string;
  onSaved: (date: string) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const b = t.dashboard.booking;
  const s = t.dashboard.schedule;
  const moving = mode.kind === "move" ? mode.appointment : null;
  const isStaff = user?.role === "staff";

  const [page, setPage] = useState<PublicBusinessPage | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [serviceId, setServiceId] = useState(moving?.serviceId ?? "");
  const [staffId, setStaffId] = useState(isStaff ? (user?.id ?? "") : (moving?.staffId._id ?? ""));
  const [date, setDate] = useState(
    moving ? localDate(moving.startTime, timezone) : mode.kind === "new" ? mode.date : "",
  );
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  const [slots, setSlots] = useState<{ key: string; data?: Availability; error?: unknown } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ message: string | null; date: string } | null>(null);

  // Services and staff come from the public page data: the same lists customers book from.
  useEffect(() => {
    let ignore = false;
    api
      .get<PublicBusinessPage>(`/public/businesses/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (ignore) return;
        setPage(data);
        if (!moving && data.services.length === 1) setServiceId(data.services[0].id);
        if (!moving && !isStaff && data.staff.length === 1) setStaffId(data.staff[0].id);
      })
      .catch((err) => !ignore && setLoadError(err));
    return () => {
      ignore = true;
    };
  }, [slug, moving, isStaff]);

  const slotsKey = serviceId && staffId && date ? `${serviceId}|${staffId}|${date}|${refreshTick}` : null;
  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    const key = `${serviceId}|${staffId}|${date}|${refreshTick}`;
    let ignore = false;
    const query = new URLSearchParams({ serviceId, staffId, date });
    if (moving) query.set("exclude", moving._id);
    api
      .get<Availability>(`/appointments/business/availability?${query}`)
      .then((data) => !ignore && setSlots({ key, data }))
      .catch((err) => !ignore && setSlots({ key, error: err }));
    return () => {
      ignore = true;
    };
  }, [serviceId, staffId, date, moving, refreshTick]);

  const slotsNow = slots?.key === slotsKey ? slots : null;
  const freeTimes = slotsNow?.data?.slots ?? [];
  const chosen = time && freeTimes.includes(time) ? time : null;

  // Close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setTime(null);
      setError("");
    };

  // The WhatsApp message for the customer, in the business's words.
  const messageFor = (
    apptName: string,
    apptPhone: string | undefined,
    start: string,
    staffName: string,
    serviceName: string,
    link?: string,
  ) => {
    if (!toWhatsAppNumber(apptPhone)) return null;
    const today = todayIn(timezone);
    const day =
      start === today
        ? s.dayToday
        : start === addDays(today, 1)
          ? s.dayTomorrow
          : s.dayOn(formatLongDate(start, t.locale));
    const parts = {
      name: apptName,
      business: user?.business?.name ?? page?.business.name ?? "",
      day,
      time: chosen ?? "",
      service: serviceName,
      staff: staffName,
    };
    const text = link ? b.bookedMessage(parts, link) : b.movedMessage(parts);
    return whatsAppLink(toWhatsAppNumber(apptPhone)!, text);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setError("");
    setSubmitting(true);
    const staffName = page?.staff.find((m) => m.id === staffId)?.name ?? moving?.staffId.name ?? "";
    try {
      if (moving) {
        await api.patch(`/appointments/${moving._id}/reschedule`, { date, time: chosen, staffId });
        const who = moving.guest ?? moving.customerId;
        setSaved({
          date,
          message: messageFor(who?.name ?? "", who?.phone, date, staffName, moving.serviceName),
        });
      } else {
        const result = await api.post<{ manageToken: string }>("/appointments/business", {
          serviceId,
          staffId,
          date,
          time: chosen,
          name: name.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          // Only with a phone number, and only if the customer said yes (Meta's opt-in rule).
          whatsappConsent: Boolean(phone.trim()) && whatsappConsent,
        });
        const serviceName = page?.services.find((x) => x.id === serviceId)?.name ?? "";
        const link = `${window.location.origin}/booking/${result.manageToken}`;
        setSaved({ date, message: messageFor(name.trim(), phone.trim(), date, staffName, serviceName, link) });
      }
    } catch (err) {
      setError(tError(err));
      setTime(null);
      // Someone may have taken the time meanwhile: fetch the free times again.
      setRefreshTick((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => {
    if (saved) onSaved(saved.date);
    onClose();
  };

  const select = "mt-1.5 w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && finish()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-form-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="booking-form-title" className="font-display text-xl font-semibold">
              {moving ? b.moveTitle : b.newTitle}
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              {moving
                ? `${(moving.guest ?? moving.customerId)?.name ?? ""} · ${moving.serviceName} · ${
                    formatMomentIn(moving.startTime, timezone, t.locale).date
                  } ${formatMomentIn(moving.startTime, timezone, t.locale).time}`
                : b.newHint}
            </p>
          </div>
          <button
            onClick={finish}
            aria-label={b.close}
            className="rounded px-2 text-2xl leading-none text-navy-400 hover:bg-navy-50"
          >
            ×
          </button>
        </div>

        {saved ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              {moving ? b.moved : b.booked}
            </p>
            {saved.message && (
              <a
                href={saved.message}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <IconWhatsApp />
                {moving ? b.tellCustomer : b.sendLink}
              </a>
            )}
            <button onClick={finish} className={`${btnSecondary} w-full`}>
              {b.done}
            </button>
          </div>
        ) : loadError ? (
          <p className={`mt-6 ${errorBox}`}>{tError(loadError)}</p>
        ) : !page ? (
          <p className="mt-6 text-sm text-navy-500">{b.loadingSlots}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {!moving && (
              <label className="block">
                <span className="text-sm font-medium">{b.service}</span>
                <select
                  required
                  value={serviceId}
                  onChange={(e) => {
                    pick(setServiceId)(e.target.value);
                    const current = page.staff.find((m) => m.id === staffId);
                    if (!isStaff && current && !offersService(current, e.target.value)) setStaffId("");
                  }}
                  className={select}
                >
                  <option value="" disabled />
                  {page.services
                    .filter((x) => !isStaff || offersService(page.staff.find((m) => m.id === staffId) ?? {}, x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {!isStaff && (
              <label className="block">
                <span className="text-sm font-medium">{b.staff}</span>
                <select required value={staffId} onChange={(e) => pick(setStaffId)(e.target.value)} className={select}>
                  <option value="" disabled />
                  {page.staff
                    .filter((m) => offersService(m, serviceId))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium">{b.date}</span>
              <input
                type="date"
                required
                min={todayIn(timezone)}
                value={date}
                onChange={(e) => e.target.value && pick(setDate)(e.target.value)}
                className={inputClass}
              />
            </label>

            {serviceId && staffId && date && (
              <div>
                <span className="text-sm font-medium">{b.time}</span>
                {!slotsNow ? (
                  <p className="mt-2 text-sm text-navy-500">{b.loadingSlots}</p>
                ) : slotsNow.error ? (
                  <p className={`mt-2 ${errorBox}`}>{tError(slotsNow.error)}</p>
                ) : freeTimes.length === 0 ? (
                  <p className="mt-2 text-sm text-navy-500">
                    {slotsNow.data?.isOpen === false ? b.closedDay : b.noSlots}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {freeTimes.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        dir="ltr"
                        onClick={() => setTime(slot)}
                        aria-pressed={slot === chosen}
                        className={`tabular rounded-lg border px-2 py-2 text-sm font-medium transition ${
                          slot === chosen
                            ? "border-brand-500 bg-brand-500 text-brand-ink"
                            : "border-navy-100 hover:border-brand-300"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!moving && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">{b.name}</span>
                    <input
                      required
                      minLength={2}
                      maxLength={60}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">
                      {b.phone} <span className="text-navy-400">{b.optional}</span>
                    </span>
                    <input
                      type="tel"
                      dir="ltr"
                      inputMode="tel"
                      maxLength={25}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="059 123 4567"
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium">
                    {b.notes} <span className="text-navy-400">{b.optional}</span>
                  </span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={inputClass}
                  />
                </label>
                {phone.trim() && (
                  <label className="flex items-start gap-2 text-sm text-navy-700">
                    <input
                      type="checkbox"
                      checked={whatsappConsent}
                      onChange={(e) => setWhatsappConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                    />
                    <span>{t.legal.whatsappConsentWalkIn}</span>
                  </label>
                )}
              </>
            )}

            {error && <p className={errorBox}>{error}</p>}

            <button type="submit" disabled={!chosen || submitting} className={`${btnPrimary} w-full`}>
              {submitting ? b.saving : moving ? b.saveMove : b.save}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
