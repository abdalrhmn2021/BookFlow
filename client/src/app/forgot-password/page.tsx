"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const { t, tError } = useLanguage();
  const p = t.password;

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(tError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-navy-100 bg-white p-8 shadow-sm">
      {sent ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.sentTitle}</h1>
          <p className="mt-2 text-sm text-navy-600">{p.sentText}</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.forgotTitle}</h1>
          <p className="mt-1 text-sm text-navy-500">{p.forgotSubtitle}</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            {error && <p className={errorBox}>{error}</p>}
            <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
              {submitting ? p.sending : p.send}
            </button>
          </form>
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
