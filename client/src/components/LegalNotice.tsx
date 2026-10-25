"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";

// "By booking you agree to the Terms of use and the Privacy policy" under a submit button.
export default function LegalNotice({ text }: { text: string }) {
  const { t } = useLanguage();
  const link = "font-medium text-navy-700 underline underline-offset-2 hover:text-brand-700";
  return (
    <p className="text-center text-xs leading-relaxed text-navy-500">
      {text}{" "}
      <Link href="/terms" target="_blank" className={link}>
        {t.legal.terms}
      </Link>{" "}
      {t.legal.and}
      {t.dir === "rtl" ? "" : " "}
      <Link href="/privacy" target="_blank" className={link}>
        {t.legal.privacy}
      </Link>
      .
    </p>
  );
}
