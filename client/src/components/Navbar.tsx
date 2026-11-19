"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBrand } from "@/context/BrandContext";
import Logo from "@/components/Logo";
import { BUSINESS_ROLES } from "@/lib/types";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { name, bookHref, isSingleBusiness } = useBrand();
  const router = useRouter();
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard")) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const navLink = "whitespace-nowrap rounded-md px-1.5 py-1 text-ink-600 transition hover:text-ink-900 sm:px-2";

  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/60 bg-ink-50/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label={name} className="shrink-0">
          <Logo compact />
        </Link>

        <div className="flex items-center gap-1 text-sm sm:gap-3">
          {!loading && (
            <>
              {!(user && BUSINESS_ROLES.includes(user.role)) && (
                <Link href={bookHref} className={`hidden sm:inline ${navLink}`}>
                  {isSingleBusiness ? t.nav.book : t.nav.businesses}
                </Link>
              )}
              {user ? (
                <>
                  <Link href={homeFor(user.role)} className={navLink}>
                    {user.role === "customer" ? t.nav.myAppointments : t.nav.dashboard}
                  </Link>
                  <Link href="/account/password" className={`hidden sm:inline ${navLink}`}>
                    {t.nav.password}
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
                    className="whitespace-nowrap rounded-xl bg-brand-500 px-3 py-2 font-semibold text-brand-ink transition hover:bg-brand-600"
                  >
                    {t.nav.signup}
                  </Link>
                </>
              )}
            </>
          )}

          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="whitespace-nowrap rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
          >
            {t.nav.switchLang}
          </button>
        </div>
      </nav>
    </header>
  );
}
