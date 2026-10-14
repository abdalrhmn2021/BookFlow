"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { homeFor, safeNext, useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import Loading from "@/components/Loading";

// Customer sign-up. (Business sign-up - /auth/register-business - gets its own page later.)
// <Suspense> is required around useSearchParams() - same as the login page.
export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { register } = useAuth();
  const { t, tError } = useLanguage();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  // One state object for the whole form instead of 4 separate useState calls
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // One handler for every input: the input's `name` says which field to update
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await register({ ...form, phone: form.phone || undefined });
      router.replace(next ?? homeFor(user.role));
    } catch (err) {
      setError(tError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-coral-500 focus:ring-4 focus:ring-coral-100";

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">{t.register.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.register.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{t.register.name}</span>
          <input name="name" required value={form.name} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.register.email}</span>
          <input name="email" type="email" required dir="ltr" autoComplete="email" value={form.email} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {t.register.phone} <span className="text-slate-400">{t.common.optional}</span>
          </span>
          <input name="phone" type="tel" dir="ltr" autoComplete="tel" value={form.phone} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.register.password}</span>
          {/* minLength matches the backend rule - quick feedback, but the backend still checks */}
          <input name="password" type="password" required dir="ltr" minLength={8} autoComplete="new-password" value={form.password} onChange={handleChange} className={inputClass} />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-coral-500 py-2.5 font-semibold text-ink-950 hover:bg-coral-400 disabled:opacity-60"
        >
          {submitting ? t.register.submitting : t.register.submit}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {t.register.haveAccount}{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-coral-700 hover:underline"
        >
          {t.register.login}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link href="/register-business" className="text-slate-500 hover:text-coral-700">
          {t.registerBusiness.cta}
        </Link>
      </p>
    </div>
  );
}
