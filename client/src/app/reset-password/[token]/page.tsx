"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { ApiError } from "@/lib/api";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";

const MIN_LENGTH = 8;

export default function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = use(params);
  const { resetPassword } = useAuth();
  const { t, tError } = useLanguage();
  const p = t.password;
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [linkDead, setLinkDead] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(p.mismatch);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const user = await resetPassword(token, password);
      router.replace(homeFor(user.role));
    } catch (err) {
      setError(tError(err));
      // A used or expired link can't be fixed by retrying: offer a new one.
      setLinkDead(err instanceof ApiError && err.message === "This reset link is invalid or has expired");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-navy-100 bg-white p-8 shadow-sm">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{p.resetTitle}</h1>
      <p className="mt-1 text-sm text-navy-500">{p.resetSubtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          <span className="mt-1 block text-xs text-navy-400">{p.hint}</span>
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

      <p className="mt-6 text-center text-sm">
        <Link href={linkDead ? "/forgot-password" : "/login"} className="font-medium text-brand-700 hover:underline">
          {linkDead ? p.requestNewLink : p.backToLogin}
        </Link>
      </p>
    </div>
  );
}
