"use client";

import { useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { homeFor, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";

const MIN_LENGTH = 8;

export default function ChangePasswordPage() {
  return (
    <RequireAuth roles={["customer", "owner", "staff"]}>
      <ChangePasswordForm />
    </RequireAuth>
  );
}

function ChangePasswordForm() {
  const { user, changePassword } = useAuth();
  const { t, tError } = useLanguage();
  const p = t.password;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError(p.mismatch);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(tError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string, hint?: string) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        required
        minLength={autoComplete === "new-password" ? MIN_LENGTH : undefined}
        dir="ltr"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setDone(false);
        }}
        className={inputClass}
      />
      {hint && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
    </label>
  );

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-navy-100 bg-white p-8 shadow-sm">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{p.changeTitle}</h1>
      <p className="mt-1 text-sm text-navy-500">{p.changeSubtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {field(p.currentPassword, current, setCurrent, "current-password")}
        {field(p.newPassword, next, setNext, "new-password", p.hint)}
        {field(p.confirmPassword, confirm, setConfirm, "new-password")}

        {error && <p className={errorBox}>{error}</p>}
        {done && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {p.changed}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          {submitting ? p.saving : p.save}
        </button>
      </form>

      {user && (
        <p className="mt-6 text-center text-sm">
          <Link href={homeFor(user.role)} className="font-medium text-brand-700 hover:underline">
            {user.role === "customer" ? t.nav.myAppointments : t.nav.dashboard}
          </Link>
        </p>
      )}
    </div>
  );
}
