"use client";

import { createContext, useContext } from "react";
import type { Brand } from "@/lib/brand";
import { useLanguage } from "@/i18n/LanguageContext";

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const brand = useContext(BrandContext);
  const { lang } = useLanguage();
  if (!brand) throw new Error("useBrand must be used inside <BrandProvider>");

  const slug = brand.singleBusinessSlug;
  return {
    name: brand.name[lang],
    logoUrl: brand.logoUrl,
    isSingleBusiness: slug !== null,
    singleBusinessSlug: slug,
    // Where "book an appointment" links go: straight to the one business, or to the directory.
    bookHref: slug ? `/book/${slug}` : "/businesses",
  };
}
