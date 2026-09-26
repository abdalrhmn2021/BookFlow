"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
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

        {/* While loading, show nothing - avoids a flash of "Log in" for a logged-in user */}
        {!loading && (
          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <Link href={homeFor(user.role)} className="text-gray-700 hover:text-indigo-600">
                  {user.role === "customer" ? "My appointments" : "Dashboard"}
                </Link>
                <span className="text-gray-400">{user.name}</span>
                <button onClick={handleLogout} className="text-gray-700 hover:text-red-600">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-gray-700 hover:text-indigo-600">
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
