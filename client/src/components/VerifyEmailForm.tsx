"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import type { User } from "@/lib/types";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";
import { CaptchaBox, useCaptcha } from "@/components/Turnstile";

// After signing up (or logging in to an account that was never confirmed): the 6-digit code from
// the email confirms the address and logs the user in (server: POST /api/auth/verify-email).
export default function VerifyEmailForm({ email, onVerified }: { email: string; onVerified: (user: User) => void }) {
  const { verifyEmail } = useAuth();
  const { t, tError } = useLanguage();
  const v = t.verifyEmail;

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  // Turnstile (when the site uses it) for "send a new code": each request needs a fresh token.
  const captcha = useCaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      onVerified(await verifyEmail(email, code));
    } catch (err) {
      setError(tError(err));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setError("");
    setResent(false);
    try {
      await api.post("/auth/resend-verification", { email, ...captcha.field });
      setResent(true);
    } catch (err) {
      setError(tError(err));
    } finally {
      captcha.reset();
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{v.title}</h1>
      <p className="mt-2 text-sm text-ink-600">{v.text}</p>
      <p className="mt-1 text-sm font-medium" dir="ltr">
        {email}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{v.code}</span>
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

        {error && <p className={errorBox}>{error}</p>}
        {resent && !error && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{v.resent}</p>}

        <button type="submit" disabled={submitting || code.length !== 6} className={`w-full ${btnPrimary}`}>
          {submitting ? v.submitting : v.submit}
        </button>
      </form>

      <div className="mt-6">
        <CaptchaBox captcha={captcha} />
      </div>
      <p className="mt-2 text-center text-sm text-ink-600">
        {v.noCode}{" "}
        <button
          type="button"
          onClick={resend}
          disabled={!captcha.ready}
          className="font-medium text-brand-700 hover:underline disabled:opacity-50"
        >
          {v.resend}
        </button>
      </p>
    </div>
  );
}
