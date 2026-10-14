"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";

// The hero shows the CUSTOMER's moment: picking a free time and booking it.
// (Plain divs - decoration only, screen readers skip it. The owner's tools live in /dashboard.)
const MOCK_TIMES = ["09:00", "09:30", "10:30", "11:00", "12:30", "14:00"];
const MOCK_TAKEN = ["09:30", "12:30"];
const MOCK_PICKED = "11:00";

function BookingPreview() {
  const { t } = useLanguage();
  const m = t.home.mock;
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      {/* a soft coral shape behind the card */}
      <div className="absolute -inset-4 -rotate-3 rounded-[2rem] bg-coral-100" />
      <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-coral-100 text-lg font-bold text-coral-700">
            {m.business.charAt(0)}
          </span>
          <p className="font-semibold text-ink-950">{m.business}</p>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-coral-500 bg-coral-50 px-4 py-3">
          <div>
            <p className="font-medium text-ink-950">{m.service}</p>
            <p className="text-sm text-slate-500">{m.duration}</p>
          </div>
          <span className="font-semibold text-ink-950">50 ₪</span>
        </div>

        <div className="mt-4 flex gap-2">
          {m.staff.map((name, i) => (
            <span
              key={name}
              className={`rounded-full border px-3 py-1 text-sm ${
                i === 0 ? "border-coral-500 bg-coral-50 font-semibold text-ink-950" : "border-slate-200 text-slate-600"
              }`}
            >
              {name}
            </span>
          ))}
        </div>

        <p className="mt-5 text-sm font-medium text-slate-700">{m.pickTime}</p>
        <div className="mt-2 grid grid-cols-3 gap-2" dir="ltr">
          {MOCK_TIMES.map((time) => (
            <span
              key={time}
              className={`tabular rounded-lg border py-2 text-center text-sm ${
                time === MOCK_PICKED
                  ? "border-coral-500 bg-coral-500 font-semibold text-ink-950"
                  : MOCK_TAKEN.includes(time)
                    ? "border-slate-100 bg-slate-50 text-slate-300 line-through"
                    : "border-slate-200 text-slate-700"
              }`}
            >
              {time}
            </span>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-coral-500 py-3 text-center font-semibold text-ink-950">{m.cta(MOCK_PICKED)}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useLanguage();
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:gap-16 md:pb-24 md:pt-20">
        <div>
          <h1 className="text-4xl font-bold leading-[1.2] text-ink-950 sm:text-5xl sm:leading-[1.15]">
            {t.home.titleStart}
            {t.home.titleHighlight}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">{t.home.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/businesses"
              className="rounded-xl bg-coral-500 px-6 py-3 font-semibold text-ink-950 hover:bg-coral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-600"
            >
              {t.home.book}
            </Link>
            <Link
              href="/register"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              {t.home.createAccount}
            </Link>
          </div>
          <Link
            href="/register-business"
            className="mt-6 inline-block text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-950"
          >
            {t.registerBusiness.cta}
          </Link>
        </div>
        <BookingPreview />
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-3">
          {t.home.features.map((f) => (
            <div key={f.title}>
              <h2 className="text-lg font-semibold text-ink-950">{f.title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
