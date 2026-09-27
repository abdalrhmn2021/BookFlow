"use client";

// The business dashboard.
//   owner -> Schedule + Services + Staff + Working hours
//   staff -> Schedule only (and the backend only returns HIS appointments)

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScheduleTab from "@/components/dashboard/ScheduleTab";
import ServicesTab from "@/components/dashboard/ServicesTab";
import StaffTab from "@/components/dashboard/StaffTab";
import HoursTab from "@/components/dashboard/HoursTab";
import Loading from "@/components/Loading";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { errorBox } from "@/lib/ui";
import type { TenantInfo } from "@/lib/types";

type Tab = "schedule" | "services" | "staff" | "hours";

export default function DashboardPage() {
  return (
    <RequireAuth roles={["owner", "staff"]}>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { t, tError } = useLanguage();

  // The business itself: name, slug, timezone, working hours (every tab needs some of it)
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>("schedule");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ tenant: TenantInfo }>("/tenants/me")
      .then((data) => {
        if (!ignore) setTenant(data.tenant);
      })
      .catch((err) => {
        if (!ignore) setError(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className={errorBox}>{tError(error)}</p>
      </div>
    );
  }
  if (!tenant || !user) return <Loading />;

  const isOwner = user.role === "owner";
  const tabs: Tab[] = isOwner ? ["schedule", "services", "staff", "hours"] : ["schedule"];
  const bookingPath = `/book/${tenant.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${bookingPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (e.g. not https) - the link is visible anyway
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="mt-1 text-gray-500">{t.dashboard.welcome(user.name, t.roles[user.role])}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">{t.dashboard.publicPage}</span>
          <Link href={bookingPath} dir="ltr" className="font-medium text-indigo-600 hover:underline">
            {bookingPath}
          </Link>
          <button
            onClick={copyLink}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
          >
            {copied ? t.dashboard.copied : t.dashboard.copy}
          </button>
        </div>
      </div>

      {/* ---- Tabs (only when there is more than one) ---- */}
      {tabs.length > 1 && (
        <div className="mt-8 flex gap-1 overflow-x-auto border-b border-gray-200">
          {tabs.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
                tab === name
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.dashboard.tabs[name]}
            </button>
          ))}
        </div>
      )}

      {/* ---- Content ----
          Only the active tab is rendered: switching tabs unmounts the old one, so each
          tab loads fresh data when opened (e.g. a service added -> visible in the schedule) */}
      <div className="mt-6">
        {tab === "schedule" && <ScheduleTab timezone={tenant.timezone} />}
        {tab === "services" && isOwner && <ServicesTab />}
        {tab === "staff" && isOwner && <StaffTab />}
        {tab === "hours" && isOwner && <HoursTab tenant={tenant} onSaved={setTenant} />}
      </div>
    </div>
  );
}
