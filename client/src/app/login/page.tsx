"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { homeFor, safeNext, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { ApiError } from "@/lib/api";
import Loading from "@/components/Loading";
import VerifyEmailForm from "@/components/VerifyEmailForm";
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
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  // Back from "forgot password" on an account with two-step login.
  const resetDone = searchParams.get("reset") === "done";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Two-step login: the server asked for the app's code after a right password.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The account was never confirmed: the server sent a code to this email.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const doLogin = async (loginEmail: string, loginPassword: string, loginCode?: string) => {
    setError("");
    setSubmitting(true);
    try {
      const user = await login(loginEmail, loginPassword, loginCode);
      router.replace(next ?? homeFor(user.role));
    } catch (err) {
      if (err instanceof ApiError && err.data.verificationRequired === true) {
        setVerifyEmail(typeof err.data.email === "string" ? err.data.email : loginEmail.trim());
        return;
      }
      const askedForCode = err instanceof ApiError && err.data.twoFactorRequired === true;
      if (askedForCode && !needCode) {
        setNeedCode(true); // first time: just show the code field, no red error
      } else {
        setError(tError(err));
      }
      if (askedForCode) setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(email, password, needCode ? code : undefined);
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 outline-none focus:border-ink-700 focus:ring-2 focus:ring-ink-100";

  if (verifyEmail) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-xl border border-ink-100 bg-white p-8 shadow-sm">
        <VerifyEmailForm email={verifyEmail} onVerified={(user) => router.replace(next ?? homeFor(user.role))} />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-ink-100 bg-white p-8 shadow-sm">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t.login.title}</h1>
      <p className="mt-1 text-sm text-ink-500">{t.login.subtitle}</p>

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
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{t.login.password}</span>
            <Link href="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">
              {t.password.forgotLink}
            </Link>
          </span>
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

        {needCode && (
          <label className="block">
            <span className="text-sm font-medium">{t.login.code}</span>
            <span className="mt-0.5 block text-xs text-ink-500">{t.login.codeHint}</span>
            <input
              type="text"
              required
              autoFocus
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} text-center font-mono tracking-[0.4em]`}
            />
          </label>
        )}

        {resetDone && !error && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t.login.resetDone}</p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-brand-ink transition hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? t.login.submitting : t.login.submit}
        </button>
      </form>

      {DEMO_ENABLED && (
        <div className="mt-6 rounded-lg bg-ink-50 p-4">
          <p className="text-center text-sm font-medium text-ink-900">{t.login.demoTitle}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(DEMO_ACCOUNTS) as (keyof typeof DEMO_ACCOUNTS)[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={submitting}
                onClick={() => doLogin(DEMO_ACCOUNTS[role], DEMO_PASSWORD)}
                className="rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs font-medium text-ink-800 hover:bg-ink-100 disabled:opacity-60"
              >
                {t.login.demoAs[role]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.login.noAccount}{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-medium text-brand-700 hover:underline"
        >
          {t.login.signup}
        </Link>
      </p>
    </div>
  );
}
