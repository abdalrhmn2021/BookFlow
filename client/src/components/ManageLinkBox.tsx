"use client";

// Shown ONCE, right after a guest books: their private "manage my booking" link.
// The server keeps only a hash of the token - if the guest loses this link, nobody
// (not even us) can show it again. So we make saving it as easy as possible:
// copy it, or send it to themselves on WhatsApp.

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

export default function ManageLinkBox({ token, businessName }: { token: string; businessName: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  // Full address (https://.../booking/<token>) - it has to work when opened from WhatsApp
  const link = `${window.location.origin}/booking/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard blocked (old browser / http): select the text so the user can copy it by hand
      const input = document.getElementById("manage-link") as HTMLInputElement | null;
      input?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // wa.me without a number -> WhatsApp asks "send to whom?" -> the guest picks themselves
  const whatsApp = `https://wa.me/?text=${encodeURIComponent(t.book.manageWhatsApp(businessName, link))}`;

  return (
    <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-start">
      <p className="font-semibold text-indigo-900">{t.book.manageTitle}</p>
      <p className="mt-1 text-sm text-indigo-900/80">{t.book.manageText}</p>
      <input
        id="manage-link"
        readOnly
        dir="ltr"
        value={link}
        onFocus={(e) => e.target.select()}
        className="mt-3 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-gray-700"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {copied ? t.book.copied : t.book.copyLink}
        </button>
        <a
          href={whatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          {t.book.sendToMe}
        </a>
        <a
          href={`/booking/${token}`}
          className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          {t.book.openLink}
        </a>
      </div>
    </div>
  );
}
