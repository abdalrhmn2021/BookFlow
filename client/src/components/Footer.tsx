"use client";

import Link from "next/link";
import { useBrand } from "@/context/BrandContext";
import { useLanguage } from "@/i18n/LanguageContext";

// On every page: the site's name and the links to the privacy policy and terms.
export default function Footer() {
  const { name } = useBrand();
  const { t } = useLanguage();

  return (
    <footer className="border-t border-ink-200/60 bg-ink-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-500">
        <p>
          © {new Date().getFullYear()} {name}
        </p>
        <nav className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink-900 hover:underline">
            {t.legal.privacy}
          </Link>
          <Link href="/terms" className="hover:text-ink-900 hover:underline">
            {t.legal.terms}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
