"use client";

// Directory of businesses - where a customer starts when they don't have a booking link.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useLanguage } from "@/i18n/LanguageContext";
import type { BusinessListItem } from "@/lib/types";

export default function BusinessesPage() {
  const { t, tError } = useLanguage();
  const [businesses, setBusinesses] = useState<BusinessListItem[] | null>(null);
  // We keep the ERROR itself, not its text: the text is made at render time with tError(),
  // so switching the language also re-translates an error that is already on screen.
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ businesses: BusinessListItem[] }>("/public/businesses")
      .then((data) => {
        if (!ignore) setBusinesses(data.businesses);
      })
      .catch((err) => {
        if (!ignore) setError(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t.businesses.title}</h1>
      <p className="mt-1 text-gray-500">{t.businesses.subtitle}</p>

      {error ? (
        <p className="mt-8 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{tError(error)}</p>
      ) : !businesses ? (
        <p className="mt-8 text-gray-500">{t.common.loading}</p>
      ) : businesses.length === 0 ? (
        <p className="mt-8 text-gray-500">{t.businesses.empty}</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {businesses.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/book/${b.slug}`}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"
              >
                {/* First letter as a simple "logo" */}
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg font-bold text-indigo-600">
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block font-semibold">{b.name}</span>
                  <span className="text-sm text-indigo-600">{t.businesses.bookNow}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
