"use client";

import { createContext, useContext, useState } from "react";
import { errorMessage } from "@/lib/api";
import { dictionaries, LANG_COOKIE, type Dictionary, type Lang } from "./dictionaries";

interface LanguageContextValue {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
  tError: (err: unknown) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const t = dictionaries[lang];

  const setLang = (next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = dictionaries[next].dir;
    setLangState(next);
  };

  const tError = (err: unknown) => errorMessage(err, (msg) => t.errors[msg] ?? msg);

  return <LanguageContext.Provider value={{ lang, t, setLang, tError }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
