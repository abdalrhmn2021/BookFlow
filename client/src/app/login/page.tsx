"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { homeFor, safeNext, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";
import { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD } from "@/lib/demo";

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
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError("");
    setSubmitting(true);
    try {
      const user = await login(loginEmail, loginPassword);
      router.replace(next ?? homeFor(user.role));
    } catch (err) {
      setError(tError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(email, password);
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100";

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-navy-100 bg-white p-8 shadow-sm">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t.login.title}</h1>
      <p className="mt-1 text-sm text-navy-500">{t.login.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{t.login.email}</span>
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

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-coral-500 py-2.5 font-semibold text-navy-950 transition hover:bg-coral-400 disabled:opacity-50"
        >
          {submitting ? t.login.submitting : t.login.submit}
        </button>
      </form>

      {DEMO_ENABLED && (
        <div className="mt-6 rounded-lg bg-navy-50 p-4">
          <p className="text-center text-sm font-medium text-navy-900">{t.login.demoTitle}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(DEMO_ACCOUNTS) as (keyof typeof DEMO_ACCOUNTS)[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={submitting}
                onClick={() => doLogin(DEMO_ACCOUNTS[role], DEMO_PASSWORD)}
                className="rounded-lg border border-navy-200 bg-white px-2 py-2 text-xs font-medium text-navy-800 hover:bg-navy-100 disabled:opacity-60"
              >
                {t.login.demoAs[role]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-navy-600">
        {t.login.noAccount}{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-medium text-coral-700 hover:underline"
        >
          {t.login.signup}
        </Link>
      </p>
    </div>
  );
}
