import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { DEFAULT_LANG, dictionaries, isLang, LANG_COOKIE } from "@/i18n/dictionaries";
import Navbar from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BookFlow",
  description: "Online booking for salons, clinics, gyms and more",
};

// The layout itself stays a SERVER component.
// AuthProvider / LanguageProvider are client components - it's fine to render them here
// and pass server-rendered children through them.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The chosen language lives in a cookie. Cookies travel with EVERY request,
  // so the server knows the language and sends the right lang/dir in the very first HTML.
  // (localStorage only exists in the browser -> the page would render in the default
  //  language first and then flip = an ugly flash.)
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : DEFAULT_LANG; // never trust a cookie value blindly

  return (
    <html
      lang={lang}
      dir={dictionaries[lang].dir}
      className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} h-full antialiased`}
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
