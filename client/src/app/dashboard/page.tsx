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
import { BUSINESS_ROLES, type DashboardAccess, type Role, type TenantInfo } from "@/lib/types";

const TABS: Record<Role, Tab[]> = {
  owner: ["overview", "schedule", "services", "staff", "hours"],
  receptionist: ["overview", "schedule"],
  staff: ["overview", "schedule"],
  customer: [],
  superadmin: [],
};
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function DashboardPage() {
  return (
    <RequireAuth roles={BUSINESS_ROLES}>
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
  // Who handles the bookings decides which buttons show (see server utils/bookingDesk.js).
  const [access, setAccess] = useState<DashboardAccess | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Bumped by NewBookingAlerts: the open tab re-fetches so the new booking shows up.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ tenant: TenantInfo; access: DashboardAccess }>("/tenants/me")
      .then((data) => {
        if (ignore) return;
        setTenant(data.tenant);
        setAccess(data.access);
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
  if (!tenant || !access || !user) return <Loading />;

  const tabs = TABS[user.role];
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
      {!access.manageBookings && (tab === "overview" || tab === "schedule") && (
        <p className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-ink-700">
          {user.role === "staff" ? t.dashboard.desk.staffView : t.dashboard.desk.ownerWatching}
        </p>
      )}
      <div className="mt-6">
        {tab === "overview" && (
          <OverviewTab timezone={tenant.timezone} onOpenDay={(d) => go("schedule", d)} refreshKey={refreshKey} />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            key={date}
            timezone={tenant.timezone}
            slug={tenant.slug}
            initialDate={date}
            refreshKey={refreshKey}
            canManage={access.manageBookings}
          />
        )}
        {tab === "services" && <ServicesTab />}
        {tab === "staff" && <StaffTab tenant={tenant} />}
        {tab === "hours" && <HoursTab tenant={tenant} onSaved={setTenant} />}
      </div>
    </DashboardShell>
  );
}
