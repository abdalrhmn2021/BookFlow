import { brandScale, HEX_REGEX } from "@/lib/color";

// Everything that makes one sold copy look like the client's own site.
// Read ONLY on the server (root layout / metadata) from environment variables,
// then handed to client components through <BrandProvider>.
export interface Brand {
  name: { en: string; ar: string };
  logoUrl: string | null;
  // Set when this install runs one business only (same value as the server's SINGLE_BUSINESS_SLUG).
  singleBusinessSlug: string | null;
}

const clean = (value: string | undefined) => value?.trim() || null;

export function getBrand(): Brand {
  const en = clean(process.env.BRAND_NAME) ?? "BookFlow";
  return {
    name: { en, ar: clean(process.env.BRAND_NAME_AR) ?? en },
    logoUrl: clean(process.env.BRAND_LOGO_URL),
    singleBusinessSlug: clean(process.env.SINGLE_BUSINESS_SLUG)?.toLowerCase() ?? null,
  };
}

// CSS variables that override the default coral palette (see globals.css).
// No BRAND_COLOR (or an invalid one) = no override = the original BookFlow colors.
export function getBrandStyle(): Record<string, string> | undefined {
  const color = clean(process.env.BRAND_COLOR);
  if (!color) return undefined;
  if (!HEX_REGEX.test(color)) {
    console.warn(`[brand] BRAND_COLOR "${color}" is not a hex color like #7c3aed - using the default colors.`);
    return undefined;
  }
  return brandScale(color.startsWith("#") ? color : `#${color}`);
}
