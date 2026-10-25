import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LANG, dictionaries, isLang, LANG_COOKIE } from "@/i18n/dictionaries";
import { getBrand } from "@/lib/brand";
import { getPublicBusiness } from "@/lib/serverApi";

// The booking page itself is a client component; this layout only gives it a real title and
// link preview, so a shared /book/<slug> link shows the business's name and services instead of
// the generic site text.
//
// For people, Next.js streams this metadata after the page (it never delays the page).
// For link-preview crawlers (Facebook, WhatsApp...) it is in <head> and they wait for it, so the
// timeout is generous - but still below what a sleeping free-tier server takes to wake up.
const LOOKUP_TIMEOUT_MS = 8000;
const SERVICES_SHOWN = 3;

export async function generateMetadata({ params }: LayoutProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const t = dictionaries[isLang(saved) ? saved : DEFAULT_LANG];
  const brand = getBrand();

  const result = await getPublicBusiness(slug, LOOKUP_TIMEOUT_MS);
  if (result.status === "not-found") {
    return { title: t.meta.notFound, robots: { index: false, follow: false } };
  }
  // API asleep or down: keep the site's generic preview (from the root layout) rather than fail.
  if (result.status === "unavailable") return {};

  const { business, services } = result.page;
  const names = services.slice(0, SERVICES_SHOWN).map((s) => s.name);
  const list =
    names.join(t.dir === "rtl" ? "، " : ", ") + (services.length > SERVICES_SHOWN ? ` ${t.meta.andMore}` : "");
  const description = t.meta.bookAt(business.name, list);

  // On a one-business site the brand is usually the business: "Laila Salon", not "Laila Salon · Laila Salon".
  const ownSite = brand.singleBusinessSlug === business.slug;
  const url = `/book/${business.slug}`;

  return {
    title: ownSite ? { absolute: business.name } : business.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: ownSite ? business.name : brand.name[t.dir === "rtl" ? "ar" : "en"],
      title: business.name,
      description,
      locale: t.dir === "rtl" ? "ar_AR" : "en_US",
      images: [{ url: brand.shareImageUrl, width: 1200, height: 630, alt: business.name }],
    },
    twitter: { card: "summary_large_image", title: business.name, description },
  };
}

export default function BookLayout({ children }: LayoutProps<"/book/[slug]">) {
  return children;
}
