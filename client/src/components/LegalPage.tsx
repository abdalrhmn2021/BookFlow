import { cookies } from "next/headers";
import Link from "next/link";
import { DEFAULT_LANG, dictionaries, isLang, LANG_COOKIE } from "@/i18n/dictionaries";
import { LEGAL_UPDATED, legalTexts } from "@/i18n/legal";
import type { LegalParams } from "@/i18n/legal";
import { getBrand, getLegalSettings } from "@/lib/brand";

// "25 October 2026" / "25 أكتوبر 2026" - with the year, unlike the booking pages' dates.
const formatUpdated = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export async function legalContext() {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : DEFAULT_LANG;
  const brand = getBrand();
  const params: LegalParams = {
    site: brand.name[lang],
    singleBusiness: Boolean(brand.singleBusinessSlug),
    ...getLegalSettings(),
  };
  return { lang, t: dictionaries[lang], legal: legalTexts[lang], params };
}

// Server-rendered, so the text is in the page itself (readable without JavaScript, by Meta's
// reviewers too, who check that a privacy policy exists before approving WhatsApp messaging).
export default async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t, legal, params } = await legalContext();
  const sections = kind === "privacy" ? legal.privacy(params) : legal.terms(params);
  const other =
    kind === "privacy" ? { href: "/terms", label: legal.termsTitle } : { href: "/privacy", label: legal.privacyTitle };

  return (
    <article className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {kind === "privacy" ? legal.privacyTitle : legal.termsTitle}
      </h1>
      <p className="mt-2 text-sm text-navy-500">
        {params.site} · {legal.updated(formatUpdated(LEGAL_UPDATED, t.locale))}
      </p>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-lg font-semibold">{section.heading}</h2>
            {/* A list first, then any closing sentence (e.g. "we don't sell your data"). */}
            {section.bullets && (
              <ul className="mt-2 list-disc space-y-1.5 ps-5 leading-relaxed text-navy-700 marker:text-brand-500">
                {section.bullets.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            )}
            {section.paragraphs?.map((text) => (
              <p key={text} className="mt-2 leading-relaxed text-navy-700">
                {text}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-navy-100 pt-6 text-sm">
        <Link href={other.href} className="font-medium text-brand-700 hover:underline">
          {other.label}
        </Link>
      </p>
    </article>
  );
}
