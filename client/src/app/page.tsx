"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";

export default function Home() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        {t.home.titleStart}
        <span className="text-indigo-600">{t.home.titleHighlight}</span>
      </h1>
      <p className="mt-6 text-lg text-gray-600">{t.home.subtitle}</p>
      <div className="mt-10 flex justify-center gap-4">
        <Link
          href="/businesses"
          className="rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
        >
          {t.home.book}
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 font-medium hover:bg-gray-50"
        >
          {t.home.createAccount}
        </Link>
      </div>
      <Link href="/register-business" className="mt-8 inline-block text-sm font-medium text-indigo-600 hover:underline">
        {t.registerBusiness.cta}
      </Link>
    </section>
  );
}
