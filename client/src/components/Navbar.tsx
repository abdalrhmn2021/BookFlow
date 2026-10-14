"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { IconGlobe } from "@/components/dashboard/icons";

// Plain text links in the bar
const navLink =
  "whitespace-nowrap rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  // The dashboard has its own side menu
  if (pathname.startsWith("/dashboard")) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 text-lg font-semibold text-ink-900">
          BookFlow
          <span className="h-2 w-2 rounded-full bg-coral-500" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-1 text-sm sm:gap-2">
          {/* While loading, show no auth links - avoids a flash of "Log in" for a logged-in user */}
          {!loading && (
            <>
              {/* Guests and customers book; owners/staff don't need the directory */}
              {user?.role !== "owner" && user?.role !== "staff" && (
                <Link href="/businesses" className={`${navLink} hidden sm:inline-block`}>
                  {t.nav.businesses}
                </Link>
              )}
              {user ? (
                <>
                  <Link href={homeFor(user.role)} className={navLink}>
                    {user.role === "customer" ? t.nav.myAppointments : t.nav.dashboard}
                  </Link>
                  <button onClick={handleLogout} className={`${navLink} hover:text-red-700`}>
                    {t.nav.logout}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className={navLink}>
                    {t.nav.login}
                  </Link>
                  <Link
                    href="/register"
                    className="whitespace-nowrap rounded-lg bg-coral-500 px-3.5 py-2 font-semibold text-ink-950 hover:bg-coral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-600"
                  >
                    {t.nav.signup}
                  </Link>
                </>
              )}
            </>
          )}

          {/* Language switch: shows the OTHER language's name (only the globe on small phones) */}
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className={`${navLink} inline-flex items-center gap-1.5`}
            aria-label={t.nav.switchLang}
          >
            <IconGlobe width={18} height={18} />
            <span className="hidden sm:inline">{t.nav.switchLang}</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
