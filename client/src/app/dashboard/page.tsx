"use client";

// The business dashboard - it has its OWN layout (the site's top navbar is hidden here):
//   a navy side menu + the section that is open.
//   owner -> Overview, Schedule, Services, Staff, Working hours
//   staff -> Overview (only his own column) + Schedule (the backend only returns HIS appointments)
// On a phone the side menu becomes a top bar with a scrollable row of sections.

import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import OverviewTab from "@/components/dashboard/OverviewTab";
import ScheduleTab from "@/components/dashboard/ScheduleTab";
import ServicesTab from "@/components/dashboard/ServicesTab";
import StaffTab from "@/components/dashboard/StaffTab";
import HoursTab from "@/components/dashboard/HoursTab";
import {
  IconCalendar,
  IconClock,
  IconCopy,
  IconGlobe,
  IconLogout,
  IconOverview,
  IconTag,
  IconUsers,
} from "@/components/dashboard/icons";
import Loading from "@/components/Loading";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { errorBox } from "@/lib/ui";
import type { TenantInfo } from "@/lib/types";

type Tab = "overview" | "schedule" | "services" | "staff" | "hours";

const TAB_ICONS: Record<Tab, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  overview: IconOverview,
  schedule: IconCalendar,
  services: IconTag,
  staff: IconUsers,
  hours: IconClock,
};

// Small square icon buttons on the navy menu
const sideIconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export default function DashboardPage() {
  return (
    <RequireAuth roles={["owner", "staff"]}>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, tError } = useLanguage();
  const router = useRouter();
  const o = t.dashboard.overview;

  // The business itself: name, slug, timezone, working hours (every section needs some of it)
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>("overview");
  // When the overview opens the schedule, it opens it on the day it was showing
  const [scheduleDate, setScheduleDate] = useState<string | undefined>(undefined);
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
  const tabs: Tab[] = isOwner ? ["overview", "schedule", "services", "staff", "hours"] : ["overview", "schedule"];
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

  const openTab = (name: Tab) => {
    setScheduleDate(undefined);
    setTab(name);
  };
  const openSchedule = (date: string) => {
    setScheduleDate(date);
    setTab("schedule");
  };
  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };
  const switchLang = () => setLang(lang === "ar" ? "en" : "ar");

  return (
    <div className="md:flex md:min-h-dvh">
      {/* ================= Side menu (top bar on phones) ================= */}
      <aside className="bg-ink-900 text-ink-100 md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-1.5 text-lg font-semibold text-white">
              BookFlow
              <span className="h-2 w-2 rounded-full bg-coral-500" aria-hidden="true" />
            </Link>
            <p className="truncate text-sm text-ink-200">{tenant.name}</p>
          </div>
          {/* Phones: language + log out live up here */}
          <div className="flex items-center md:hidden">
            <button onClick={switchLang} className={sideIconBtn} aria-label={t.nav.switchLang} title={t.nav.switchLang}>
              <IconGlobe />
            </button>
            <button onClick={handleLogout} className={sideIconBtn} aria-label={o.logout} title={o.logout}>
              <IconLogout className="rtl:-scale-x-100" />
            </button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
          {tabs.map((name) => {
            const Icon = TAB_ICONS[name];
            const active = tab === name;
            return (
              <button
                key={name}
                onClick={() => openTab(name)}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active ? "bg-white/10 text-white" : "text-ink-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && (
                  <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-coral-500" aria-hidden="true" />
                )}
                <Icon />
                {t.dashboard.tabs[name]}
              </button>
            );
          })}
        </nav>

        {/* Desktop: booking link + who is logged in */}
        <div className="hidden space-y-4 border-t border-white/10 p-4 md:block">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-xs text-ink-200">{o.bookingPage}</p>
            <div className="mt-1 flex items-center gap-1">
              <Link href={bookingPath} dir="ltr" className="min-w-0 flex-1 truncate text-sm font-medium text-white hover:underline">
                {bookingPath}
              </Link>
              <button
                onClick={copyLink}
                className={sideIconBtn}
                aria-label={t.dashboard.copy}
                title={copied ? t.dashboard.copied : t.dashboard.copy}
              >
                {copied ? <span className="text-sm text-coral-300">✓</span> : <IconCopy width={16} height={16} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-ink-200">{t.roles[user.role]}</p>
            </div>
            <div className="flex">
              <button onClick={switchLang} className={sideIconBtn} aria-label={t.nav.switchLang} title={t.nav.switchLang}>
                <IconGlobe />
              </button>
              <button onClick={handleLogout} className={sideIconBtn} aria-label={o.logout} title={o.logout}>
                <IconLogout className="rtl:-scale-x-100" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= The open section ================= */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-ink-950">{t.dashboard.tabs[tab]}</h1>
              <p className="mt-1 text-sm text-slate-500">{t.dashboard.welcome(user.name, t.roles[user.role])}</p>
            </div>
            {/* Phones: the booking link (on desktop it sits in the side menu) */}
            <div className="flex items-center gap-2 text-sm md:hidden">
              <Link href={bookingPath} dir="ltr" className="font-medium text-ink-700 hover:underline">
                {bookingPath}
              </Link>
              <button
                onClick={copyLink}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              >
                {copied ? t.dashboard.copied : t.dashboard.copy}
              </button>
            </div>
          </header>

          {/* Only the open section is rendered: each one loads fresh data when opened */}
          {tab === "overview" && <OverviewTab tenant={tenant} isOwner={isOwner} onOpenSchedule={openSchedule} />}
          {tab === "schedule" && (
            <ScheduleTab key={scheduleDate ?? "today"} timezone={tenant.timezone} initialDate={scheduleDate} />
          )}
          {tab === "services" && isOwner && <ServicesTab />}
          {tab === "staff" && isOwner && <StaffTab />}
          {tab === "hours" && isOwner && <HoursTab tenant={tenant} onSaved={setTenant} />}
        </div>
      </div>
    </div>
  );
}
