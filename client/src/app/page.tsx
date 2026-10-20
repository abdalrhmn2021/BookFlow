"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import { btnPrimary } from "@/lib/ui";

// The sample card's time slots. One of them is "taken by you" (coral) - the whole idea of the app.
const SAMPLE_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
const SAMPLE_PICKED = "10:30";

export default function Home() {
  const { t } = useLanguage();
  const s = t.home.sample;

  return (
    <>
      {/* ---- Hero: the promise on one side, what the customer actually sees on the other ---- */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
              {t.home.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">{t.home.subtitle}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/businesses" className={`${btnPrimary} px-6 py-3 text-base`}>
                {t.home.book}
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center rounded-lg border border-white/20 px-6 py-3 text-base font-medium text-white transition hover:bg-white/10"
              >
                {t.home.createAccount}
              </Link>
            </div>
          </div>

          {/* Sample booking card - a picture of the product, not a real form (aria-hidden) */}
          <div aria-hidden="true" className="rounded-2xl bg-white p-6 text-navy-900 shadow-2xl shadow-black/30">
            <p className="font-display text-lg font-semibold">{s.business}</p>
            <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-coral-500 bg-coral-50 px-4 py-3">
              <span>
                <span className="block font-semibold">{s.service}</span>
                <span className="text-sm text-navy-500">
                  {s.duration} · {s.staff}
                </span>
              </span>
              <span className="tabular font-semibold">50 ₪</span>
            </div>
            <p className="mt-5 text-sm font-medium text-navy-500">{s.day}</p>
            <div dir="ltr" className="tabular mt-2 grid grid-cols-4 gap-2">
              {SAMPLE_SLOTS.map((slot) => (
                <span
                  key={slot}
                  className={`rounded-lg py-2 text-center text-sm font-medium ${
                    slot === SAMPLE_PICKED
                      ? "bg-coral-500 text-navy-950"
                      : slot === "09:30" || slot === "12:00"
                        ? "bg-navy-50 text-navy-300 line-through"
                        : "border border-navy-100 text-navy-700"
                  }`}
                >
                  {slot}
                </span>
              ))}
            </div>
            <span className="mt-6 block rounded-lg bg-navy-900 py-3 text-center font-semibold text-white">{s.cta}</span>
          </div>
        </div>
      </section>

      {/* ---- For business owners ---- */}
      <section className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12">
        <div>
          <h2 className="font-display text-xl font-semibold">{t.home.forBusinessTitle}</h2>
          <p className="mt-1 text-navy-500">{t.home.forBusinessText}</p>
        </div>
        <Link
          href="/register-business"
          className="rounded-lg bg-navy-900 px-5 py-3 font-semibold text-white transition hover:bg-navy-700"
        >
          {t.registerBusiness.cta}
        </Link>
      </section>
    </>
  );
}
