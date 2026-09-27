"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold text-indigo-600">
          BookFlow
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {/* While loading, show no auth links - avoids a flash of "Log in" for a logged-in user */}
          {!loading && (
            <>
              {/* Guests and customers book; owners/staff don't need the directory */}
              {user?.role !== "owner" && user?.role !== "staff" && (
                <Link href="/businesses" className="text-gray-700 hover:text-indigo-600">
                  {t.nav.businesses}
                </Link>
              )}
              {user ? (
                <>
                  <Link href={homeFor(user.role)} className="text-gray-700 hover:text-indigo-600">
                    {user.role === "customer" ? t.nav.myAppointments : t.nav.dashboard}
                  </Link>
                  <span className="hidden text-gray-400 sm:inline">{user.name}</span>
                  <button onClick={handleLogout} className="text-gray-700 hover:text-red-600">
                    {t.nav.logout}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-gray-700 hover:text-indigo-600">
                    {t.nav.login}
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
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
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t.nav.switchLang}
          </button>
        </div>
      </nav>
    </header>
  );
}
