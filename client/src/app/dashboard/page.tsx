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
import NewBookingAlerts from "@/components/dashboard/NewBookingAlerts";
import Loading from "@/components/Loading";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { errorBox } from "@/lib/ui";
import type { TenantInfo } from "@/lib/types";

const OWNER_TABS: Tab[] = ["overview", "schedule", "services", "staff", "hours"];
const STAFF_TABS: Tab[] = ["overview", "schedule"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type TenantRequest = Promise<{ tenant: TenantInfo }>;

export default function DashboardPage() {
  // The business is asked for as soon as the page opens, at the same time as the login check
  // (AuthContext's /auth/me), instead of after it: one round trip less before the dashboard shows.
  // Not logged in = a 401 nobody waits for (RequireAuth sends the visitor to /login). The server
  // checks the login on this request like on any other.
  // Started once, in the browser only (the server-side render has no login cookie to send).
  const [tenantRequest] = useState<TenantRequest | null>(() => {
    if (typeof window === "undefined") return null;
    const request = api.get<{ tenant: TenantInfo }>("/tenants/me");
    request.catch(() => {}); // handled by Dashboard; this only stops an "unhandled rejection" after a redirect
    return request;
  });

  return (
    <RequireAuth roles={["owner", "staff"]}>
      <Suspense fallback={<Loading />}>
        {tenantRequest ? <Dashboard tenantRequest={tenantRequest} /> : <Loading />}
      </Suspense>
    </RequireAuth>
  );
}

function Dashboard({ tenantRequest }: { tenantRequest: TenantRequest }) {
  const { user } = useAuth();
  const { t, tError } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Bumped by NewBookingAlerts: the open tab re-fetches so the new booking shows up.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    tenantRequest
      .then((data) => {
        if (!ignore) setTenant(data.tenant);
      })
      .catch((err) => {
        if (!ignore) setError(err);
      });
    return () => {
      ignore = true;
    };
  }, [tenantRequest]);

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
      <NewBookingAlerts
        timezone={tenant.timezone}
        onOpenDay={(d) => go("schedule", d)}
        onNew={() => setRefreshKey((n) => n + 1)}
      />
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.dashboard.tabs[tab]}</h1>
      <div className="mt-6">
        {tab === "overview" && (
          <OverviewTab timezone={tenant.timezone} onOpenDay={(d) => go("schedule", d)} refreshKey={refreshKey} />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            key={date}
            timezone={tenant.timezone}
            slug={tenant.slug}
            countryCode={tenant.phoneCountryCode}
            initialDate={date}
            refreshKey={refreshKey}
          />
        )}
        {tab === "services" && <ServicesTab />}
        {tab === "staff" && <StaffTab tenant={tenant} />}
        {tab === "hours" && <HoursTab tenant={tenant} onSaved={setTenant} />}
      </div>
    </DashboardShell>
  );
}
