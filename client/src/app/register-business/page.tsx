"use client";

// Business sign-up: creates the business (tenant) + its owner account in ONE request.
// The backend does it inside a transaction: either both are created, or neither.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { btnPrimary, errorBox, inputClass } from "@/lib/ui";

// Same rule as the Tenant model's `match` - checked here for quick feedback,
// the backend checks it again (never trust the frontend).
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "Al Ward Salon!" -> "al-ward-salon"
// An Arabic name gives "" (no English letters) - then the owner types the link himself.
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // every run of "other characters" becomes ONE dash
    .replace(/^-+|-+$/g, "") //     no dash at the start or the end
    .slice(0, 40);
}

export default function RegisterBusinessPage() {
  const { registerBusiness } = useAuth();
  const { t, tError } = useLanguage();
  const router = useRouter();

  const [form, setForm] = useState({ businessName: "", slug: "", ownerName: "", email: "", phone: "", password: "" });
  // Once the owner edits the link by hand, we stop overwriting it from the business name
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "businessName" && !slugEdited) {
      setForm({ ...form, businessName: value, slug: toSlug(value) });
    } else if (name === "slug") {
      setSlugEdited(true);
      setForm({ ...form, slug: value.toLowerCase() });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const slugValid = SLUG_REGEX.test(form.slug) && form.slug.length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await registerBusiness({ ...form, phone: form.phone || undefined });
      router.replace("/dashboard");
    } catch (err) {
      setError(tError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const r = t.registerBusiness;

  return (
    <div className="mx-auto mt-12 mb-16 max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">{r.title}</h1>
      <p className="mt-1 text-sm text-gray-500">{r.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{r.businessName}</span>
          <input name="businessName" required value={form.businessName} onChange={handleChange} className={inputClass} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{r.slug}</span>
          {/* The prefix shows the final URL while typing */}
          <div dir="ltr" className="mt-1 flex rounded-md border border-gray-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
            <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">/book/</span>
            <input
              name="slug"
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={handleChange}
              className="w-full rounded-e-md px-3 py-2 text-sm outline-none"
            />
          </div>
          <span className={`mt-1 block text-xs ${form.slug && !slugValid ? "text-red-600" : "text-gray-500"}`}>
            {r.slugHint}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">{r.ownerName}</span>
          <input name="ownerName" required value={form.ownerName} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{r.email}</span>
          <input name="email" type="email" required dir="ltr" autoComplete="email" value={form.email} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {r.phone} <span className="text-gray-400">{t.common.optional}</span>
          </span>
          <input name="phone" type="tel" dir="ltr" autoComplete="tel" value={form.phone} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{r.password}</span>
          <input name="password" type="password" required dir="ltr" minLength={8} autoComplete="new-password" value={form.password} onChange={handleChange} className={inputClass} />
        </label>

        {error && <p className={errorBox}>{error}</p>}

        <button type="submit" disabled={submitting || !slugValid} className={`w-full ${btnPrimary}`}>
          {submitting ? r.submitting : r.submit}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        {r.haveAccount}{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          {r.login}
        </Link>
      </p>
    </div>
  );
}
