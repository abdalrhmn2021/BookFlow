"use client";

// The dashboard's frame: a dark navy sidebar (desktop) / top bar with scrolling tabs (phone),
// and the page content next to it. It replaces the site's Navbar on /dashboard.
//
//   desktop                         phone
//   ┌────────┬──────────────┐       ┌──────────────────┐
//   │ logo   │              │       │ logo     EN  ⎋   │
//   │ ▸ tab  │   content    │       │ tab tab tab ...  │
//   │   tab  │              │       ├──────────────────┤
//   │   ...  │              │       │ content          │
//   │ link   │              │       │                  │
//   │ you ⎋  │              │       └──────────────────┘
//   └────────┴──────────────┘
//
// The sidebar is the FIRST child of a flex row -> on the right in Arabic, on the left in English.
// No extra code for RTL: flexbox follows the page direction (dir="rtl").

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  IconCalendar,
  IconClock,
  IconGlobe,
  IconLink,
  IconLogout,
  IconOverview,
  IconServices,
  IconUsers,
} from "@/components/icons";
import type { TenantInfo } from "@/lib/types";

export type Tab = "overview" | "schedule" | "services" | "staff" | "hours";

const TAB_ICONS: Record<Tab, (p: { className?: string }) => React.ReactElement> = {
  overview: IconOverview,
  schedule: IconCalendar,
  services: IconServices,
  staff: IconUsers,
  hours: IconClock,
};

export default function DashboardShell({
  tenant,
  tabs,
  active,
  onSelect,
  children,
}: {
  tenant: TenantInfo;
  tabs: Tab[];
  active: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

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

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const switchLang = () => setLang(lang === "ar" ? "en" : "ar");

  return (
    <div className="min-h-screen lg:flex">
      {/* ================= Sidebar (desktop) ================= */}
      {/* The outer div stretches to the page height (navy all the way down);
          the inner one sticks to the top while the content scrolls */}
      <div className="hidden w-64 shrink-0 bg-navy-950 lg:block">
      <aside className="sticky top-0 flex h-screen flex-col text-white">
        <div className="px-5 pt-6">
          <Logo light />
          <p className="font-display mt-6 truncate text-sm font-medium text-white">{tenant.name}</p>
          <p className="truncate text-xs text-navy-300">{user && `${user.name} · ${t.roles[user.role]}`}</p>
        </div>

        <nav className="mt-6 flex-1 space-y-1 px-3" aria-label={t.nav.dashboard}>
          {tabs.map((name) => {
            const Icon = TAB_ICONS[name];
            const current = name === active;
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                aria-current={current ? "page" : undefined}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition ${
                  current ? "bg-white/10 text-white" : "text-navy-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {/* The coral bar on the START edge marks where you are (start = right in Arabic) */}
                {current && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-coral-500" />}
                <Icon className={`h-5 w-5 ${current ? "text-coral-400" : ""}`} />
                {t.dashboard.tabs[name]}
              </button>
            );
          })}
        </nav>

        {/* The public booking link: the thing an owner shares most */}
        <div className="mx-3 rounded-xl bg-white/5 p-3">
          <p className="flex items-center gap-2 text-xs text-navy-300">
            <IconLink className="h-4 w-4" />
            {t.dashboard.bookingPage}
          </p>
          <Link href={bookingPath} dir="ltr" className="mt-1 block truncate text-sm font-medium text-white hover:underline">
            {bookingPath}
          </Link>
          <button
            onClick={copyLink}
            className="mt-2 w-full rounded-md bg-coral-500 py-1.5 text-xs font-semibold text-navy-950 transition hover:bg-coral-400"
          >
            {copied ? t.dashboard.copied : t.dashboard.copy}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-1 border-t border-white/10 px-3 py-3">
          <button
            onClick={switchLang}
            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-300 transition hover:bg-white/5 hover:text-white"
          >
            <IconGlobe className="h-4 w-4" />
            {t.nav.switchLang}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-300 transition hover:bg-white/5 hover:text-white"
          >
            <IconLogout className="h-4 w-4 rtl:rotate-180" />
            {t.nav.logout}
          </button>
        </div>
      </aside>
      </div>

      {/* ================= Top bar (phone / tablet) ================= */}
      <header className="sticky top-0 z-20 bg-navy-950 text-white lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Logo light />
          <div className="flex items-center gap-1">
            <button onClick={switchLang} className="rounded-md px-2 py-1.5 text-xs font-medium text-navy-200 hover:bg-white/10">
              {t.nav.switchLang}
            </button>
            <button onClick={handleLogout} className="rounded-md p-1.5 text-navy-200 hover:bg-white/10" aria-label={t.nav.logout}>
              <IconLogout className="h-5 w-5 rtl:rotate-180" />
            </button>
          </div>
        </div>
        {tabs.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label={t.nav.dashboard}>
            {tabs.map((name) => (
              <button
                key={name}
                onClick={() => onSelect(name)}
                aria-current={name === active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  name === active ? "bg-coral-500 text-navy-950" : "text-navy-200 hover:bg-white/10"
                }`}
              >
                {t.dashboard.tabs[name]}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ================= Content ================= */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
          {/* Phone only: the business name + booking link (on desktop they're in the sidebar) */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 lg:hidden">
            <p className="font-display font-semibold">{tenant.name}</p>
            <button onClick={copyLink} className="flex items-center gap-1.5 text-sm font-medium text-coral-700">
              <IconLink className="h-4 w-4" />
              {copied ? t.dashboard.copied : t.dashboard.copy}
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
