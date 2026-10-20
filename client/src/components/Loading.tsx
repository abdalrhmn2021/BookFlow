"use client";

import { useLanguage } from "@/i18n/LanguageContext";

export default function Loading({ text }: { text?: string }) {
  const { t } = useLanguage();
  return (
    <p role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-navy-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-200 border-t-coral-500" />
      {text ?? t.common.loading}
    </p>
  );
}
