"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { api, ApiError } from "@/lib/api";
import { btnPrimary, btnSecondary, errorBox } from "@/lib/ui";
import type { AdminBusiness } from "@/lib/types";

// Your panel as the seller: every client business on this server.
// Only the "superadmin" role can open it (npm run create-admin); the API checks that too.
export default function AdminPage() {
  return (
    <RequireAuth roles={["superadmin"]}>
      <Admin />
    </RequireAuth>
  );
}

const shortDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function Admin() {
  const { t, tError } = useLanguage();
  const a = t.admin;

  const [businesses, setBusinesses] = useState<AdminBusiness[] | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ businesses: AdminBusiness[]; plans: string[] }>("/admin/businesses")
      .then((data) => {
        if (ignore) return;
        setBusinesses(data.businesses);
        setPlans(data.plans);
      })
      .catch((err) => !ignore && setLoadError(err));
    return () => {
      ignore = true;
    };
  }, [reload]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className={errorBox}>{tError(loadError)}</p>
      </main>
    );
  }
  if (!businesses) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-navy-500">{t.common.loading}</main>;
  }

  const stats = [
    { label: a.total, value: businesses.length },
    { label: a.active, value: businesses.filter((b) => b.isActive).length },
    { label: a.overdue, value: businesses.filter((b) => b.isActive && b.overdue).length, warn: true },
    { label: a.bookings30, value: businesses.reduce((sum, b) => sum + b.bookingsLast30Days, 0) },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-1 text-sm text-navy-500">{a.subtitle}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-navy-100 bg-white p-4">
            <p className="text-xs text-navy-500">{s.label}</p>
            <p className={`tabular mt-1 text-2xl font-semibold ${s.warn && s.value ? "text-red-600" : ""}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {businesses.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-sm text-navy-500">
          {a.empty}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {businesses.map((b) => (
            <BusinessCard key={b.id} business={b} plans={plans} onChanged={() => setReload((n) => n + 1)} />
          ))}
        </ul>
      )}
    </main>
  );
}

function BusinessCard({
  business: b,
  plans,
  onChanged,
}: {
  business: AdminBusiness;
  plans: string[];
  onChanged: () => void;
}) {
  const { t, tError } = useLanguage();
  const a = t.admin;

  const [paidUntil, setPaidUntil] = useState(b.paidUntil?.slice(0, 10) ?? "");
  const [plan, setPlan] = useState(b.plan);
  const [note, setNote] = useState(b.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = paidUntil !== (b.paidUntil?.slice(0, 10) ?? "") || plan !== b.plan || note !== b.note;

  const patch = async (body: Record<string, unknown>) => {
    setError("");
    setBusy(true);
    try {
      await api.patch(`/admin/businesses/${b.id}`, body);
      onChanged();
    } catch (err) {
      setError(tError(err));
    } finally {
      setBusy(false);
    }
  };

  // The business's data as a JSON file (services, staff, customers, bookings) - e.g. at contract end.
  // A plain fetch, not lib/api: the answer is a file to save, not JSON for the page.
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setError("");
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/businesses/${b.id}/export`, { credentials: "same-origin" });
      if (!res.ok)
        throw new ApiError(res.status, (await res.json().catch(() => ({}))).message ?? "Something went wrong");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${b.slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(tError(err));
    } finally {
      setExporting(false);
    }
  };

  const toggleActive = () => {
    if (b.isActive && !window.confirm(a.confirmOff(b.name))) return;
    patch({ isActive: !b.isActive });
  };

  const owner = b.owners[0];
  const badge = (text: string, tone: string) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{text}</span>
  );

  return (
    <li className={`rounded-xl border bg-white p-4 ${b.isActive ? "border-navy-100" : "border-navy-200 opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {b.name}
            {b.isActive
              ? badge(a.activeBadge, "bg-emerald-50 text-emerald-700")
              : badge(a.disabledBadge, "bg-navy-50 text-navy-500")}
            {b.isActive && b.overdue && badge(a.overdueBadge, "bg-red-50 text-red-700")}
          </p>
          <p dir="ltr" className="text-sm text-navy-500 rtl:text-right">
            /{b.slug}
          </p>
          {owner && (
            <p className="mt-1 text-sm">
              <span className="text-navy-500">{a.owner}: </span>
              {owner.name} ·{" "}
              <span dir="ltr">
                {owner.email}
                {owner.phone && ` · ${owner.phone}`}
              </span>
            </p>
          )}
          <p className="mt-1 text-xs text-navy-400">
            {a.staff(b.staffCount)} · {a.stats(b.bookingsLast30Days, b.upcomingBookings)} ·{" "}
            {b.lastBookingAt ? a.lastBooking(shortDate(b.lastBookingAt, t.locale)) : a.noBookings} ·{" "}
            {a.created(shortDate(b.createdAt, t.locale))}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/book/${b.slug}`} className={btnSecondary}>
            {a.openSite}
          </Link>
          <button onClick={exportData} disabled={exporting} className={btnSecondary}>
            {exporting ? t.legal.exporting : t.legal.exportData}
          </button>
          <button onClick={toggleActive} disabled={busy} className={btnSecondary}>
            {b.isActive ? a.switchOff : a.switchOn}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-navy-100 pt-4 sm:grid-cols-[auto_auto_auto_auto_1fr]">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={b.whatsappReminders}
            disabled={busy}
            onChange={(e) => patch({ whatsappReminders: e.target.checked })}
            className="h-4 w-4 accent-brand-600"
          />
          {a.whatsapp}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={b.aiAssistant}
            disabled={busy}
            onChange={(e) => patch({ aiAssistant: e.target.checked })}
            className="h-4 w-4 accent-brand-600"
          />
          {a.assistant}
        </label>
        <label className="text-sm">
          <span className="block text-xs text-navy-500">{a.plan}</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="mt-1 rounded-lg border border-navy-200 bg-white px-2 py-1.5"
          >
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-navy-500">{a.paidUntil}</span>
          <input
            type="date"
            value={paidUntil}
            onChange={(e) => setPaidUntil(e.target.value)}
            className="mt-1 rounded-lg border border-navy-200 bg-white px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-navy-500">{a.note}</span>
          <input
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-navy-200 bg-white px-2 py-1.5"
          />
        </label>
      </div>
      {dirty && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => patch({ plan, paidUntil: paidUntil || null, note })}
            disabled={busy}
            className={btnPrimary}
          >
            {busy ? t.common.saving : t.common.save}
          </button>
          <button
            onClick={() => {
              setPaidUntil(b.paidUntil?.slice(0, 10) ?? "");
              setPlan(b.plan);
              setNote(b.note);
            }}
            disabled={busy}
            className={btnSecondary}
          >
            {t.common.cancel}
          </button>
        </div>
      )}
      {error && <p className={`mt-3 ${errorBox}`}>{error}</p>}
    </li>
  );
}
