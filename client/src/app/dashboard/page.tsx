"use client";

// The business dashboard.
//   owner -> Overview + Schedule + Services + Staff + Working hours
//   staff -> Overview + Schedule (and the backend only returns HIS appointments)
//
// The open tab lives in the URL: /dashboard?tab=schedule&date=2026-10-21
//   - refresh -> you stay on the same tab
//   - you can share / bookmark a tab
//   - the browser's Back button goes to the previous tab

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import DashboardShell, { type Tab } from "@/components/dashboard/DashboardShell";
import OverviewTab from "@/components/dashboard/OverviewTab";
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

const OWNER_TABS: Tab[] = ["overview", "schedule", "services", "staff", "hours"];
const STAFF_TABS: Tab[] = ["overview", "schedule"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function DashboardPage() {
  return (
    <RequireAuth roles={["owner", "staff"]}>
      {/* useSearchParams() needs a <Suspense> boundary (same as the login page) */}
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </RequireAuth>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The business itself: name, slug, timezone, working hours (every tab needs some of it)
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<unknown>(null);

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

  const tabs = user.role === "owner" ? OWNER_TABS : STAFF_TABS;
  // Never trust the URL: an unknown tab (or ?tab=staff for a staff member) -> the first tab
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : tabs[0];
  const dateParam = params.get("date");
  const date = dateParam && DATE_REGEX.test(dateParam) ? dateParam : undefined;

  // Change the URL -> useSearchParams changes -> this component re-renders with the new tab.
  // push (not replace): every tab is a step in the history, so Back returns to the previous tab.
  const go = (next: Tab, nextDate?: string) => {
    const query = new URLSearchParams({ tab: next });
    if (nextDate) query.set("date", nextDate);
    router.push(`${pathname}?${query}`, { scroll: false });
  };

  return (
    <DashboardShell tenant={tenant} tabs={tabs} active={tab} onSelect={(next) => go(next)}>
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.dashboard.tabs[tab]}</h1>
      <div className="mt-6">
        {/* Only the active tab is rendered: switching tabs unmounts the old one, so each
            tab loads fresh data when opened (e.g. a service added -> visible in the schedule) */}
        {tab === "overview" && <OverviewTab timezone={tenant.timezone} onOpenDay={(d) => go("schedule", d)} />}
        {/* key={date}: a new date from the URL (e.g. clicked in Overview) = a fresh schedule */}
        {tab === "schedule" && <ScheduleTab key={date} timezone={tenant.timezone} initialDate={date} />}
        {tab === "services" && <ServicesTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "hours" && <HoursTab tenant={tenant} onSaved={setTenant} />}
      </div>
    </DashboardShell>
  );
}
