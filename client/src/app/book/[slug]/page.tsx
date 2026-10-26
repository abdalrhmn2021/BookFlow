"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";
import ManageLinkBox from "@/components/ManageLinkBox";
import LegalNotice from "@/components/LegalNotice";
import { addDays, dayNameOf, formatDayChip, formatDuration, formatLongDate, formatPrice, todayIn } from "@/lib/format";
import { inputClass } from "@/lib/ui";
import { offersService, type Availability, type GuestBookingResult, type PublicBusinessPage } from "@/lib/types";

const DAYS_AHEAD = 14;
// "Any staff member": the server merges everyone's free times and picks who is free at booking.
const ANY_STAFF = "any";

interface Draft {
  serviceId: string;
  staffId: string;
  date: string;
  time: string | null;
}
const draftKey = (slug: string) => `bookflow_draft_${slug}`;

const GUEST_KEY = "bookflow_guest";
interface GuestDetails {
  name: string;
  phone: string;
}
function readGuest(): GuestDetails {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
    if (typeof saved?.name === "string" && typeof saved?.phone === "string") return saved;
  } catch {}
  return { name: "", phone: "" };
}
function saveGuest(details: GuestDetails) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(details));
  } catch {}
}

function readDraft(slug: string, data: PublicBusinessPage): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(slug));
    sessionStorage.removeItem(draftKey(slug));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;

    const today = todayIn(data.business.timezone);
    const valid =
      data.services.some((s) => s.id === draft.serviceId) &&
      (draft.staffId === ANY_STAFF || data.staff.some((s) => s.id === draft.staffId)) &&
      draft.date >= today &&
      draft.date <= addDays(today, DAYS_AHEAD - 1);
    return valid ? draft : null;
  } catch {
    return null;
  }
}

export default function BookPage({ params }: PageProps<"/book/[slug]">) {
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { t, tError } = useLanguage();

  const [page, setPage] = useState<PublicBusinessPage | null>(null);
  const [pageError, setPageError] = useState<{ status: number; err: unknown } | null>(null);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // Off until the customer ticks it: WhatsApp reminders need their opt-in (Meta's rules).
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [guest, setGuest] = useState<GuestDetails>(() =>
    typeof window === "undefined" ? { name: "", phone: "" } : readGuest(),
  );

  const [refreshTick, setRefreshTick] = useState(0);
  const [slotsResult, setSlotsResult] = useState<{ key: string; data?: Availability; error?: unknown } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState("");
  const [booked, setBooked] = useState<{
    serviceName: string;
    staffName: string;
    date: string;
    time: string;
    guestPhone?: string;
    manageToken?: string;
  } | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<PublicBusinessPage>(`/public/businesses/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (ignore) return;
        setPage(data);
        const draft = readDraft(slug, data);
        if (draft) {
          setServiceId(draft.serviceId);
          setStaffId(draft.staffId);
          setDate(draft.date);
          setPickedTime(draft.time);
        }
      })
      .catch((err) => {
        if (ignore) return;
        setPageError({ status: err instanceof ApiError ? err.status : 0, err });
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  const slotsKey = serviceId && staffId && date ? `${serviceId}|${staffId}|${date}|${refreshTick}` : null;

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    const key = `${serviceId}|${staffId}|${date}|${refreshTick}`;
    let ignore = false;

    const query = new URLSearchParams({ serviceId, staffId, date });
    api
      .get<Availability>(`/public/businesses/${encodeURIComponent(slug)}/availability?${query}`)
      .then((data) => {
        if (!ignore) setSlotsResult({ key, data });
      })
      .catch((err) => {
        if (!ignore) setSlotsResult({ key, error: err });
      });
    return () => {
      ignore = true;
    };
  }, [slug, serviceId, staffId, date, refreshTick]);

  // A response only counts if its key matches the current choices (ignores late, stale answers).
  const slotsNow = slotsResult && slotsResult.key === slotsKey ? slotsResult : null;
  const slotsLoading = slotsKey !== null && slotsNow === null;
  const slots = slotsNow?.data?.slots ?? [];
  const time = pickedTime && slots.includes(pickedTime) ? pickedTime : null;

  const choose = (setter: (id: string) => void, value: string) => {
    setter(value);
    setPickedTime(null);
    setBookError("");
  };

  const saveDraft = () => {
    if (!serviceId || !staffId || !date) return;
    try {
      const draft: Draft = { serviceId, staffId, date, time };
      sessionStorage.setItem(draftKey(slug), JSON.stringify(draft));
    } catch {}
  };

  const handleBook = async () => {
    if (!page || !serviceId || !staffId || !date || !time) return;
    setBookError("");
    setSubmitting(true);
    const body = { serviceId, staffId, date, time, notes: notes.trim() || undefined, whatsappConsent };
    let manageToken: string | undefined;
    // With "any staff member", only the server's answer says who it is.
    let staffName = page.staff.find((s) => s.id === staffId)?.name ?? "";
    try {
      if (user) {
        const result = await api.post<{ staffName?: string }>("/appointments", { ...body, slug: page.business.slug });
        if (result.staffName) staffName = result.staffName;
      } else {
        const details = { name: guest.name.trim(), phone: guest.phone.trim() };
        const result = await api.post<GuestBookingResult>(
          `/public/businesses/${encodeURIComponent(page.business.slug)}/appointments`,
          { ...body, ...details },
        );
        manageToken = result.manageToken;
        if (result.appointment.staffName) staffName = result.appointment.staffName;
        saveGuest(details);
      }
      setBooked({
        serviceName: page.services.find((s) => s.id === serviceId)?.name ?? "",
        staffName,
        date,
        time,
        guestPhone: user ? undefined : guest.phone.trim(),
        manageToken,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBookError(t.book.taken);
        setRefreshTick((t) => t + 1);
      } else {
        setBookError(tError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const bookAnother = () => {
    setBooked(null);
    setPickedTime(null);
    setNotes("");
    setRefreshTick((t) => t + 1);
  };

  if (pageError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {pageError.status === 404 ? t.book.notFoundTitle : t.book.loadErrorTitle}
        </h1>
        <p className="mt-2 text-navy-500">{pageError.status === 404 ? t.book.notFoundText : tError(pageError.err)}</p>
        <Link href="/" className="mt-6 inline-block font-medium text-brand-700 hover:underline">
          {t.common.backHome}
        </Link>
      </div>
    );
  }

  if (!page) return <Loading />;

  const { business, services, staff } = page;

  if (booked) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{t.book.bookedTitle}</h1>
        <p className="mt-2 text-navy-600">
          <b>{booked.serviceName}</b> {t.book.bookedWith} <b>{booked.staffName}</b>
          <br />
          {t.book.bookedAt(formatLongDate(booked.date, t.locale), booked.time)}
        </p>
        <p className="mt-3 text-sm text-navy-500">{t.book.willConfirm(business.name)}</p>
        {booked.guestPhone && <p className="mt-1 text-sm text-navy-500">{t.book.guestBooked(booked.guestPhone)}</p>}
        {booked.manageToken && <ManageLinkBox token={booked.manageToken} businessName={business.name} />}
        <div className="mt-8 flex justify-center gap-3">
          {!booked.guestPhone && (
            <Link
              href="/my-appointments"
              className="rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-brand-ink transition hover:bg-brand-400"
            >
              {t.book.myAppointments}
            </Link>
          )}
          <button
            onClick={bookAnother}
            className="rounded-lg border border-navy-200 px-4 py-2 font-medium hover:bg-navy-50"
          >
            {t.book.bookAnother}
          </button>
        </div>
      </div>
    );
  }

  const service = services.find((s) => s.id === serviceId);
  // Only the staff who do this service (a staff member with no list does them all).
  const staffForService = staff.filter((m) => offersService(m, serviceId));
  // "Any staff member" is offered when more than one person does the service.
  const offerAny = staffForService.length > 1;
  const member =
    staffId === ANY_STAFF && offerAny
      ? { id: ANY_STAFF, name: t.book.anyStaff }
      : staffForService.find((s) => s.id === staffId);

  const today = todayIn(business.timezone);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const isOpenOn = (d: string) => business.workingHours.find((w) => w.day === dayNameOf(d))?.isOpen ?? false;

  const nextUrl = `/book/${business.slug}`;

  return (
    <>
      <header className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-10">
          <span className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-2xl font-semibold text-brand-ink">
            {business.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{business.name}</h1>
            <p className="mt-1 text-navy-200">{t.book.subtitle}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <Step n={1} title={t.book.step1}>
          {services.length === 0 ? (
            <Empty>{t.book.noServices}</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    choose(setServiceId, s.id);
                    // The staff member picked before may not do this service.
                    const current = staff.find((m) => m.id === staffId);
                    if (current && !offersService(current, s.id)) setStaffId(null);
                  }}
                  className={`rounded-lg border p-4 text-start transition ${
                    s.id === serviceId
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
                      : "border-navy-100 bg-white hover:border-brand-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span dir="ltr" className="tabular font-semibold text-navy-900">
                      {formatPrice(s.price)}
                    </span>
                  </div>
                  {s.description && <p className="mt-1 text-sm text-navy-500">{s.description}</p>}
                  <p className="mt-2 text-xs text-navy-400">{formatDuration(s.duration, t.duration)}</p>
                </button>
              ))}
            </div>
          )}
        </Step>

        {service && (
          <Step n={2} title={t.book.step2}>
            {staffForService.length === 0 ? (
              <Empty>{t.book.noStaff}</Empty>
            ) : (
              <div className="flex flex-wrap gap-2">
                {offerAny && (
                  <Chip selected={staffId === ANY_STAFF} onClick={() => choose(setStaffId, ANY_STAFF)}>
                    {t.book.anyStaff}
                  </Chip>
                )}
                {staffForService.map((m) => (
                  <Chip key={m.id} selected={m.id === staffId} onClick={() => choose(setStaffId, m.id)}>
                    {m.name}
                  </Chip>
                ))}
              </div>
            )}
          </Step>
        )}

        {service && member && (
          <Step n={3} title={t.book.step3}>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const { weekday, day, month } = formatDayChip(d, t.locale);
                const open = isOpenOn(d);
                return (
                  <button
                    key={d}
                    disabled={!open}
                    onClick={() => choose(setDate, d)}
                    className={`flex w-16 shrink-0 flex-col items-center rounded-lg border py-2 text-sm transition ${
                      d === date
                        ? "border-brand-500 bg-brand-500 text-brand-ink"
                        : open
                          ? "border-navy-100 bg-white hover:border-brand-300"
                          : "cursor-not-allowed border-navy-100 bg-navy-50 text-navy-300"
                    }`}
                  >
                    <span className="text-xs">{d === today ? t.book.today : weekday}</span>
                    <span className="text-lg font-semibold">{day}</span>
                    <span className="text-xs">{open ? month : t.book.closed}</span>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {service && member && date && (
          <Step n={4} title={t.book.step4(formatLongDate(date, t.locale))}>
            {slotsLoading ? (
              <p className="text-sm text-navy-500">{t.book.loadingSlots}</p>
            ) : slotsNow?.error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tError(slotsNow.error)}</p>
            ) : slots.length === 0 ? (
              <Empty>
                {slotsNow?.data?.isOpen === false
                  ? t.book.closedDay
                  : member.id === ANY_STAFF
                    ? t.book.noSlotsAny
                    : t.book.noSlots(member.name)}
              </Empty>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots.map((t) => (
                  <Chip key={t} selected={t === time} onClick={() => setPickedTime(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            )}
            {bookError && !time && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{bookError}</p>
            )}
          </Step>
        )}

        {service && member && date && time && (
          <Step n={5} title={t.book.step5}>
            <div className="rounded-xl border border-navy-100 bg-white p-5">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-navy-500">{t.book.service}</dt>
                <dd className="font-medium">{service.name}</dd>
                <dt className="text-navy-500">{t.book.with}</dt>
                <dd className="font-medium">{member.name}</dd>
                <dt className="text-navy-500">{t.book.when}</dt>
                <dd className="font-medium">
                  {formatLongDate(date, t.locale)}, {time}
                </dd>
                <dt className="text-navy-500">{t.book.duration}</dt>
                <dd className="font-medium">{formatDuration(service.duration, t.duration)}</dd>
                <dt className="text-navy-500">{t.book.price}</dt>
                <dd className="font-medium">{formatPrice(service.price)}</dd>
              </dl>

              {authLoading ? null : user && user.role !== "customer" ? (
                <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t.book.businessAccount(t.roles[user.role])}
                </p>
              ) : (
                <form
                  className="mt-5 space-y-4 border-t border-navy-100 pt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleBook();
                  }}
                >
                  {!user && (
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-semibold">{t.book.guestTitle}</legend>
                      <p className="text-xs text-navy-500">{t.book.guestHint}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium">{t.book.guestName}</span>
                          <input
                            required
                            minLength={2}
                            maxLength={60}
                            autoComplete="name"
                            value={guest.name}
                            onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                            placeholder={t.book.guestNamePlaceholder}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium">{t.book.guestPhone}</span>
                          <input
                            required
                            type="tel"
                            dir="ltr"
                            inputMode="tel"
                            autoComplete="tel"
                            maxLength={25}
                            value={guest.phone}
                            onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                            placeholder="059 123 4567"
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </fieldset>
                  )}

                  <label className="block">
                    <span className="text-sm font-medium">
                      {t.book.notes} <span className="text-navy-400">{t.common.optional}</span>
                    </span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder={t.book.notesPlaceholder}
                      className={inputClass}
                    />
                  </label>

                  <label className="flex items-start gap-2 text-sm text-navy-700">
                    <input
                      type="checkbox"
                      checked={whatsappConsent}
                      onChange={(e) => setWhatsappConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                    />
                    <span>{t.legal.whatsappConsent}</span>
                  </label>

                  {bookError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{bookError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-brand-ink transition hover:bg-brand-400 disabled:opacity-50"
                  >
                    {submitting ? t.book.booking : t.book.bookFor(formatPrice(service.price))}
                  </button>
                  <LegalNotice text={t.legal.agreeBooking} />

                  {!user && (
                    <p className="text-center text-sm text-navy-500">
                      {t.book.haveAccount}{" "}
                      <Link
                        href={`/login?next=${encodeURIComponent(nextUrl)}`}
                        onClick={saveDraft}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t.book.loginToBook}
                      </Link>
                      {" · "}
                      <Link
                        href={`/register?next=${encodeURIComponent(nextUrl)}`}
                        onClick={saveDraft}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t.book.signup}
                      </Link>
                    </p>
                  )}
                </form>
              )}
            </div>
          </Step>
        )}
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display flex items-center gap-3 text-lg font-semibold">
        <span className="tabular flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-sm text-white">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`tabular rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
        selected ? "border-brand-500 bg-brand-500 text-brand-ink" : "border-navy-100 bg-white hover:border-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-4 text-sm text-navy-500">
      {children}
    </p>
  );
}
