"use client";

// The current language, shared with every component (same idea as AuthContext).
//   const { t, lang, setLang, tError } = useLanguage();
//   <h1>{t.login.title}</h1>

import { createContext, useContext, useState } from "react";
import { errorMessage } from "@/lib/api";
import { dictionaries, LANG_COOKIE, type Dictionary, type Lang } from "./dictionaries";

interface LanguageContextValue {
  lang: Lang;
  t: Dictionary; // the texts of the current language
  setLang: (lang: Lang) => void;
  tError: (err: unknown) => string; // any caught error -> a message in the current language
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// initialLang comes from the SERVER (root layout read the cookie),
// so the first render already matches the <html lang dir> the server sent.
export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const t = dictionaries[lang];

  const setLang = (next: Lang) => {
    // 1) Remember it for next time. A cookie (not localStorage) because the server
    //    must read it on the next page load to render the right direction immediately.
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // 2) Flip the page direction right now, without a reload
    document.documentElement.lang = next;
    document.documentElement.dir = dictionaries[next].dir;
    // 3) Re-render every component that uses useLanguage() with the new texts
    setLangState(next);
  };

  // errorMessage() already knows how to read our ApiError; we just translate each message
  const tError = (err: unknown) => errorMessage(err, (msg) => t.errors[msg] ?? msg);

  return <LanguageContext.Provider value={{ lang, t, setLang, tError }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
