"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { homeFor, safeNext, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";
import { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD } from "@/lib/demo";

// useSearchParams() reads the URL in the browser, so Next.js needs a <Suspense>
// boundary around it (otherwise `next build` fails for this page).
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const { t, tError } = useLanguage();
  const router = useRouter();
  // e.g. /login?next=/book/al-ward -> go back to the booking page after login
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Shared by the form AND the demo buttons
  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError("");
    setSubmitting(true); // disables the buttons -> no double submit
    try {
      const user = await login(loginEmail, loginPassword);
      router.replace(next ?? homeFor(user.role)); // replace: "back" won't return to the login form
    } catch (err) {
      setError(tError(err)); // e.g. "Invalid credentials" -> translated from the dictionary
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // stop the browser from reloading the page
    doLogin(email, password);
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">{t.login.title}</h1>
      <p className="mt-1 text-sm text-gray-500">{t.login.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{t.login.email}</span>
          {/* dir="ltr": emails and passwords are always left-to-right, even on an Arabic page */}
          <input
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t.login.password}</span>
          <input
            type="password"
            required
            dir="ltr"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? t.login.submitting : t.login.submit}
        </button>
      </form>

      {/* One-click demo: recruiters won't create an account just to look around */}
      {DEMO_ENABLED && (
        <div className="mt-6 rounded-lg bg-indigo-50 p-4">
          <p className="text-center text-sm font-medium text-indigo-900">{t.login.demoTitle}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(DEMO_ACCOUNTS) as (keyof typeof DEMO_ACCOUNTS)[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={submitting}
                onClick={() => doLogin(DEMO_ACCOUNTS[role], DEMO_PASSWORD)}
                className="rounded-md border border-indigo-200 bg-white px-2 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                {t.login.demoAs[role]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        {t.login.noAccount}{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-medium text-indigo-600 hover:underline"
        >
          {t.login.signup}
        </Link>
      </p>
    </div>
  );
}
