import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Alexandria, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { DEFAULT_LANG, dictionaries, isLang, LANG_COOKIE } from "@/i18n/dictionaries";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getBrand, getBrandStyle, getSiteUrl } from "@/lib/brand";
import "./globals.css";

const heading = Alexandria({
  variable: "--font-heading",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans_Arabic({
  variable: "--font-body",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

async function currentLang() {
  // Language comes from a cookie so the server renders the right lang/dir (no RTL flash).
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(saved) ? saved : DEFAULT_LANG;
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrand();
  const lang = await currentLang();
  const name = brand.name[lang];
  const description = brand.singleBusinessSlug ? dictionaries[lang].meta.bookHere : dictionaries[lang].meta.platform;
  return {
    metadataBase: getSiteUrl(),
    title: { default: name, template: `%s · ${name}` },
    description,
    // Link previews (Facebook, WhatsApp, X...). Pages like /book/[slug] add their own title and text.
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      locale: lang === "ar" ? "ar_AR" : "en_US",
      images: [{ url: brand.shareImageUrl, width: 1200, height: 630, alt: name }],
    },
    twitter: { card: "summary_large_image" },
    // The tab icon: the client's logo, or the default BookFlow icon (public/favicon.ico).
    // It is set here and not as app/favicon.ico, because a file in app/ would always win.
    icons: { icon: brand.logoUrl ?? "/favicon.ico" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await currentLang();

  return (
    <html
      lang={lang}
      dir={dictionaries[lang].dir}
      className={`${heading.variable} ${body.variable} h-full antialiased`}
      // BRAND_COLOR -> --color-brand-* variables; they override the defaults in globals.css.
      style={getBrandStyle()}
    >
      <body className="flex min-h-full flex-col font-sans">
        <LanguageProvider initialLang={lang}>
          <BrandProvider brand={getBrand()}>
            <AuthProvider>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </AuthProvider>
          </BrandProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
