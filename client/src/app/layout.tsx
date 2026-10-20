import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Alexandria, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { DEFAULT_LANG, dictionaries, isLang, LANG_COOKIE } from "@/i18n/dictionaries";
import Navbar from "@/components/Navbar";
import { BRAND_NAME } from "@/lib/edition";
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

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: `${BRAND_NAME} - online booking`,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Language comes from a cookie so the server renders the right lang/dir (no RTL flash).
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : DEFAULT_LANG;

  return (
    <html
      lang={lang}
      dir={dictionaries[lang].dir}
      className={`${heading.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <LanguageProvider initialLang={lang}>
          <AuthProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
