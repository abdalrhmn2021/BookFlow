"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import Logo from "@/components/Logo";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  // The dashboard has its own navigation (the sidebar) -> no top bar there
  if (pathname.startsWith("/dashboard")) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const navLink = "whitespace-nowrap rounded-md px-1.5 py-1 text-navy-600 transition hover:text-navy-900 sm:px-2";

  return (
    <header className="sticky top-0 z-20 border-b border-navy-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="BookFlow" className="shrink-0">
          <Logo compact />
        </Link>

        <div className="flex items-center gap-1 text-sm sm:gap-3">
          {/* While loading, show no auth links - avoids a flash of "Log in" for a logged-in user */}
          {!loading && (
            <>
              {/* Guests and customers book; owners/staff don't need the directory */}
              {user?.role !== "owner" && user?.role !== "staff" && (
                <Link href="/businesses" className={`hidden sm:inline ${navLink}`}>
                  {t.nav.businesses}
                </Link>
              )}
              {user ? (
                <>
                  <Link href={homeFor(user.role)} className={navLink}>
                    {user.role === "customer" ? t.nav.myAppointments : t.nav.dashboard}
                  </Link>
                  <button onClick={handleLogout} className={navLink}>
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
                    className="whitespace-nowrap rounded-lg bg-navy-900 px-3 py-2 font-semibold text-white transition hover:bg-navy-700"
                  >
                    {t.nav.signup}
                  </Link>
                </>
              )}
            </>
          )}

          {/* Language switch: shows the OTHER language's name */}
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="whitespace-nowrap rounded-lg border border-navy-200 px-2.5 py-1.5 text-xs font-medium text-navy-700 transition hover:bg-navy-50"
          >
            {t.nav.switchLang}
          </button>
        </div>
      </nav>
    </header>
  );
}
