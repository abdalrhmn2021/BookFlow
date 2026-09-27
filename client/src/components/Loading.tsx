"use client";

import { useLanguage } from "@/i18n/LanguageContext";

// The same "Loading..." everywhere, in the current language
export default function Loading({ text }: { text?: string }) {
  const { t } = useLanguage();
  return <p className="p-8 text-center text-gray-500">{text ?? t.common.loading}</p>;
}
