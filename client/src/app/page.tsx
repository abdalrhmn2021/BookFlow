"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import { btnPrimary } from "@/lib/ui";

const SAMPLE_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
const SAMPLE_PICKED = "10:30";

export default function Home() {
  const { t } = useLanguage();
  const s = t.home.sample;

  return (
    <>
      <section className="relative overflow-hidden">
        {/* Soft green and sand glows behind the hero - decoration only. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -end-32 h-[28rem] w-[28rem] rounded-full bg-brand-100 opacity-70 blur-3xl" />
          <div className="absolute -bottom-48 -start-24 h-[26rem] w-[26rem] rounded-full bg-ink-200 opacity-60 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-sm font-medium text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              {t.home.badge}
            </span>
            <h1 className="font-display mt-6 text-4xl leading-tight font-semibold tracking-tight text-balance text-ink-950 sm:text-6xl">
              {t.home.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">{t.home.subtitle}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/businesses" className={`${btnPrimary} px-6 py-3 text-base`}>
                {t.home.book}
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center rounded-xl border border-ink-200 bg-white px-6 py-3 text-base font-medium text-ink-900 transition hover:border-ink-300 hover:bg-ink-50"
              >
                {t.home.createAccount}
              </Link>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="rounded-3xl border border-ink-100 bg-white p-6 text-ink-900 shadow-2xl shadow-ink-900/10"
          >
            <p className="font-display text-lg font-semibold">{s.business}</p>
            <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-brand-500 bg-brand-50 px-4 py-3">
              <span>
                <span className="block font-semibold">{s.service}</span>
                <span className="text-sm text-ink-500">
                  {s.duration} · {s.staff}
                </span>
              </span>
              <span className="tabular font-semibold">50 ₪</span>
            </div>
            <p className="mt-5 text-sm font-medium text-ink-500">{s.day}</p>
            <div dir="ltr" className="tabular mt-2 grid grid-cols-4 gap-2">
              {SAMPLE_SLOTS.map((slot) => (
                <span
                  key={slot}
                  className={`rounded-lg py-2 text-center text-sm font-medium ${
                    slot === SAMPLE_PICKED
                      ? "bg-brand-500 text-brand-ink"
                      : slot === "09:30" || slot === "12:00"
                        ? "bg-ink-50 text-ink-300 line-through"
                        : "border border-ink-100 text-ink-700"
                  }`}
                >
                  {slot}
                </span>
              ))}
            </div>
            <span className="mt-6 block rounded-xl bg-ink-900 py-3 text-center font-semibold text-white">{s.cta}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto mb-16 flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-3xl border border-ink-100 bg-white px-6 py-8 shadow-soft sm:px-10">
        <div>
          <h2 className="font-display text-xl font-semibold">{t.home.forBusinessTitle}</h2>
          <p className="mt-1 text-ink-500">{t.home.forBusinessText}</p>
        </div>
        <Link
          href="/register-business"
          className="rounded-xl bg-ink-900 px-5 py-3 font-semibold text-white transition hover:bg-ink-700"
        >
          {t.registerBusiness.cta}
        </Link>
      </section>
    </>
  );
}
