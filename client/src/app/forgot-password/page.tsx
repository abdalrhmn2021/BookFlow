"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { CaptchaBox, useCaptcha } from "@/components/Turnstile";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";

const MIN_LENGTH = 8;

// Forgot password, on one page:
//   1. the email -> the server emails a 6-digit code (valid 15 minutes, 5 tries)
//   2. the code + a new password -> saved, and the user is logged in
export default function ForgotPasswordPage() {
  const { t, tError } = useLanguage();
  const p = t.password;
  const { resetPassword } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Turnstile (when the site uses it): every code request needs a fresh token.
  const captcha = useCaptcha();

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim(), ...captcha.field });
      setCode("");
      setStep("code");
    } catch (err) {
      setError(tError(err));
    } finally {
      captcha.reset();
      setSubmitting(false);
    }
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(p.mismatch);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const user = await resetPassword(email.trim(), code, password);
      // null: two-step login is on, so the code doesn't log in - the login page asks for the app's code.
      router.replace(user ? homeFor(user.role) : "/login?reset=done");
    } catch (err) {
      setError(tError(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-ink-100 bg-white p-8 shadow-sm">
      {step === "email" ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.forgotTitle}</h1>
          <p className="mt-1 text-sm text-ink-500">{p.forgotSubtitle}</p>
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">{p.email}</span>
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
            <CaptchaBox captcha={captcha} />
            {error && <p className={errorBox}>{error}</p>}
            <button type="submit" disabled={submitting || !captcha.ready} className={`${btnPrimary} w-full`}>
              {submitting ? p.sending : p.send}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.sentTitle}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {p.sentText}{" "}
            <span dir="ltr" className="font-medium text-ink-700">
              {email.trim()}
            </span>
          </p>
          <form onSubmit={saveNewPassword} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">{p.code}</span>
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
            <label className="block">
              <span className="text-sm font-medium">{p.newPassword}</span>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-ink-400">{p.hint}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">{p.confirmPassword}</span>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                dir="ltr"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </label>

            {error && <p className={errorBox}>{error}</p>}

            <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
              {submitting ? p.saving : p.save}
            </button>
          </form>
          <div className="mt-4">
            <CaptchaBox captcha={captcha} />
          </div>
          <p className="mt-2 text-center text-sm text-ink-600">
            {p.noCode}{" "}
            <button
              type="button"
              disabled={submitting || !captcha.ready}
              onClick={() => sendCode()}
              className="font-medium text-brand-700 hover:underline disabled:opacity-50"
            >
              {p.resendCode}
            </button>
          </p>
        </>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {p.backToLogin}
        </Link>
      </p>
    </div>
  );
}
