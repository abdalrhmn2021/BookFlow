import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, dictionaries, isLang } from "@/i18n/dictionaries";

// The tab title in the visitor's language ("حجزك" / "Your booking"), like the privacy and terms pages.
// A private link: never indexed, and never sent on as a referrer.
export async function generateMetadata(): Promise<Metadata> {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : DEFAULT_LANG;
  return {
    title: dictionaries[lang].manage.title,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function BookingLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
