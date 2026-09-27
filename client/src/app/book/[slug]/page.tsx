"use client";

// Public booking page: /book/<business-slug>
// Anyone can open it - login is only needed at the very last step (confirm).
//
// The flow is a chain:   service -> staff -> day -> free time -> confirm
// Each step only appears after the one above it is chosen, and changing
// an earlier choice clears the time (the free times depend on all of them).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";
import {
  addDays,
  dayNameOf,
  formatDayChip,
  formatDuration,
  formatLongDate,
  formatPrice,
  todayIn,
} from "@/lib/format";
import type { Availability, PublicBusinessPage } from "@/lib/types";

const DAYS_AHEAD = 14; // customers can book up to 2 weeks ahead

// ---------- Draft: survive the trip to the login page ----------
// A guest picks everything, then has to log in. Without this they'd come back
// to an empty page and pick it all again. sessionStorage = this browser tab only,
// cleared when the tab closes - perfect for a short-lived "draft".
interface Draft {
  serviceId: string;
  staffId: string;
  date: string;
  time: string | null;
}
const draftKey = (slug: string) => `bookflow_draft_${slug}`;

function readDraft(slug: string, data: PublicBusinessPage): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(slug));
    sessionStorage.removeItem(draftKey(slug)); // use it once
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;

    // The business may have changed since the draft was saved -> only keep it if it's still valid.
    // "YYYY-MM-DD" strings compare correctly as plain text: "2026-10-03" < "2026-10-12".
    const today = todayIn(data.business.timezone);
    const valid =
      data.services.some((s) => s.id === draft.serviceId) &&
      data.staff.some((s) => s.id === draft.staffId) &&
      draft.date >= today &&
      draft.date <= addDays(today, DAYS_AHEAD - 1);
    return valid ? draft : null;
  } catch {
    return null; // storage blocked or broken JSON -> just start fresh
  }
}

export default function BookPage({ params }: PageProps<"/book/[slug]">) {
  // In Next 16, params is a Promise. use() unwraps it inside a client component.
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { t, tError } = useLanguage();

  // ---------- 1) Load the business (services, staff, hours) ----------
  const [page, setPage] = useState<PublicBusinessPage | null>(null);
  // Errors are kept as-is and translated at render time with tError()
  const [pageError, setPageError] = useState<{ status: number; err: unknown } | null>(null);

  // ---------- 2) The customer's choices ----------
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // ---------- 3) Free times ----------
  // Bumping this number forces the slots to reload (used after a 409 "already taken").
  const [refreshTick, setRefreshTick] = useState(0);
  // We remember WHICH request the result belongs to (key). If the key doesn't match
  // the current choices, the result is old -> we are loading. No separate "loading" state needed.
  const [slotsResult, setSlotsResult] = useState<{ key: string; data?: Availability; error?: unknown } | null>(
    null
  );

  // ---------- 4) Booking ----------
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState("");
  const [booked, setBooked] = useState<{ serviceName: string; staffName: string; date: string; time: string } | null>(
    null
  );

  useEffect(() => {
    // `ignore` protects us if the slug changes (or the page closes) before the answer arrives:
    // an old, late answer must not overwrite the new one.
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
    if (!serviceId || !staffId || !date) return; // not everything chosen yet
    const key = `${serviceId}|${staffId}|${date}|${refreshTick}`;
    let ignore = false;

    // URLSearchParams builds "serviceId=...&staffId=...&date=..." and escapes the values safely
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

  // ---------- Derived values (calculated on every render, not stored) ----------
  const slotsNow = slotsResult && slotsResult.key === slotsKey ? slotsResult : null;
  const slotsLoading = slotsKey !== null && slotsNow === null;
  const slots = slotsNow?.data?.slots ?? [];
  // A time only counts as "chosen" if it is STILL free in the latest list.
  const time = pickedTime && slots.includes(pickedTime) ? pickedTime : null;

  // ---------- Handlers ----------
  // Changing anything above the time clears the time + old errors
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
    } catch {
      // storage blocked - not a big deal, they'll just pick again
    }
  };

  const handleBook = async () => {
    if (!page || !serviceId || !staffId || !date || !time) return;
    setBookError("");
    setSubmitting(true);
    try {
      await api.post("/appointments", {
        slug: page.business.slug,
        serviceId,
        staffId,
        date,
        time,
        notes: notes.trim() || undefined,
      });
      setBooked({
        serviceName: page.services.find((s) => s.id === serviceId)?.name ?? "",
        staffName: page.staff.find((s) => s.id === staffId)?.name ?? "",
        date,
        time,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone booked this time between our slot list loading and this click.
        // The backend's lock caught it - reload the list so the taken time disappears.
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
    setRefreshTick((t) => t + 1); // the time we just booked is no longer free
  };

  // ---------- Render ----------
  if (pageError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">
          {pageError.status === 404 ? t.book.notFoundTitle : t.book.loadErrorTitle}
        </h1>
        <p className="mt-2 text-gray-500">
          {pageError.status === 404 ? t.book.notFoundText : tError(pageError.err)}
        </p>
        <Link href="/" className="mt-6 inline-block font-medium text-indigo-600 hover:underline">
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-bold">{t.book.bookedTitle}</h1>
        <p className="mt-2 text-gray-600">
          <b>{booked.serviceName}</b> {t.book.bookedWith} <b>{booked.staffName}</b>
          <br />
          {t.book.bookedAt(formatLongDate(booked.date, t.locale), booked.time)}
        </p>
        <p className="mt-3 text-sm text-gray-500">{t.book.willConfirm(business.name)}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/my-appointments"
            className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            {t.book.myAppointments}
          </Link>
          <button onClick={bookAnother} className="rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50">
            {t.book.bookAnother}
          </button>
        </div>
      </div>
    );
  }

  const service = services.find((s) => s.id === serviceId);
  const member = staff.find((s) => s.id === staffId);

  // The next 14 days, starting from TODAY in the business's timezone
  const today = todayIn(business.timezone);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const isOpenOn = (d: string) => business.workingHours.find((w) => w.day === dayNameOf(d))?.isOpen ?? false;

  const nextUrl = `/book/${business.slug}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{business.name}</h1>
      <p className="mt-1 text-gray-500">{t.book.subtitle}</p>

      {/* ---- 1. Service ---- */}
      <Step n={1} title={t.book.step1}>
        {services.length === 0 ? (
          <Empty>{t.book.noServices}</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => choose(setServiceId, s.id)}
                className={`rounded-lg border p-4 text-start transition ${
                  s.id === serviceId
                    ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-gray-200 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-semibold text-indigo-600">{formatPrice(s.price)}</span>
                </div>
                {s.description && <p className="mt-1 text-sm text-gray-500">{s.description}</p>}
                <p className="mt-2 text-xs text-gray-400">{formatDuration(s.duration, t.duration)}</p>
              </button>
            ))}
          </div>
        )}
      </Step>

      {/* ---- 2. Staff ---- */}
      {service && (
        <Step n={2} title={t.book.step2}>
          {staff.length === 0 ? (
            <Empty>{t.book.noStaff}</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {staff.map((m) => (
                <Chip key={m.id} selected={m.id === staffId} onClick={() => choose(setStaffId, m.id)}>
                  {m.name}
                </Chip>
              ))}
            </div>
          )}
        </Step>
      )}

      {/* ---- 3. Day ---- */}
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
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : open
                        ? "border-gray-200 bg-white hover:border-indigo-300"
                        : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
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

      {/* ---- 4. Time ---- */}
      {service && member && date && (
        <Step n={4} title={t.book.step4(formatLongDate(date, t.locale))}>
          {slotsLoading ? (
            <p className="text-sm text-gray-500">{t.book.loadingSlots}</p>
          ) : slotsNow?.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{tError(slotsNow.error)}</p>
          ) : slots.length === 0 ? (
            <Empty>
              {slotsNow?.data?.isOpen === false
                ? t.book.closedDay
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
          {/* bookError also shows here, because after a 409 the time is gone and step 5 disappears */}
          {bookError && !time && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{bookError}</p>
          )}
        </Step>
      )}

      {/* ---- 5. Confirm ---- */}
      {service && member && date && time && (
        <Step n={5} title={t.book.step5}>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500">{t.book.service}</dt>
              <dd className="font-medium">{service.name}</dd>
              <dt className="text-gray-500">{t.book.with}</dt>
              <dd className="font-medium">{member.name}</dd>
              <dt className="text-gray-500">{t.book.when}</dt>
              <dd className="font-medium">
                {formatLongDate(date, t.locale)}, {time}
              </dd>
              <dt className="text-gray-500">{t.book.duration}</dt>
              <dd className="font-medium">{formatDuration(service.duration, t.duration)}</dd>
              <dt className="text-gray-500">{t.book.price}</dt>
              <dd className="font-medium">{formatPrice(service.price)}</dd>
            </dl>

            {authLoading ? null : !user ? (
              // Guest: save the choices, go log in, come back here (?next=...)
              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="text-sm text-gray-600">{t.book.loginToConfirm}</p>
                <div className="mt-3 flex gap-3">
                  <Link
                    href={`/login?next=${encodeURIComponent(nextUrl)}`}
                    onClick={saveDraft}
                    className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
                  >
                    {t.book.loginToBook}
                  </Link>
                  <Link
                    href={`/register?next=${encodeURIComponent(nextUrl)}`}
                    onClick={saveDraft}
                    className="rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
                  >
                    {t.book.signup}
                  </Link>
                </div>
              </div>
            ) : user.role !== "customer" ? (
              // The backend would answer 403 anyway (restrictTo("customer")) - we just explain it nicely
              <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t.book.businessAccount(t.roles[user.role])}
              </p>
            ) : (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <label className="block">
                  <span className="text-sm font-medium">
                    {t.book.notes} <span className="text-gray-400">{t.common.optional}</span>
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder={t.book.notesPlaceholder}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                {bookError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{bookError}</p>}
                <button
                  onClick={handleBook}
                  disabled={submitting}
                  className="mt-4 w-full rounded-md bg-indigo-600 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? t.book.booking : t.book.bookFor(formatPrice(service.price))}
                </button>
              </div>
            )}
          </div>
        </Step>
      )}
    </div>
  );
}

// ---------- Small building blocks used only on this page ----------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm text-white">{n}</span>
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
      className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
        selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white hover:border-indigo-300"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-500">{children}</p>;
}
