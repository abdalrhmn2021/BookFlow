"use client";

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
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : tabs[0];
  const dateParam = params.get("date");
  const date = dateParam && DATE_REGEX.test(dateParam) ? dateParam : undefined;

  const go = (next: Tab, nextDate?: string) => {
    const query = new URLSearchParams({ tab: next });
    if (nextDate) query.set("date", nextDate);
    router.push(`${pathname}?${query}`, { scroll: false });
  };

  return (
    <DashboardShell tenant={tenant} tabs={tabs} active={tab} onSelect={(next) => go(next)}>
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.dashboard.tabs[tab]}</h1>
      <div className="mt-6">
        {tab === "overview" && <OverviewTab timezone={tenant.timezone} onOpenDay={(d) => go("schedule", d)} />}
        {tab === "schedule" && <ScheduleTab key={date} timezone={tenant.timezone} initialDate={date} />}
        {tab === "services" && <ServicesTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "hours" && <HoursTab tenant={tenant} onSaved={setTenant} />}
      </div>
    </DashboardShell>
  );
}
