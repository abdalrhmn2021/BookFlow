import { brandScale, HEX_REGEX } from "@/lib/color";

// Everything that makes one sold copy look like the client's own site.
// Read ONLY on the server (root layout / metadata) from environment variables,
// then handed to client components through <BrandProvider>.
export interface Brand {
  name: { en: string; ar: string };
  logoUrl: string | null;
  // The picture shown when a link is shared (Facebook, WhatsApp...): 1200x630.
  // BRAND_SHARE_IMAGE_URL, or a generic "book online" image without any brand name on it.
  shareImageUrl: string;
  // Set when this install runs one business only (same value as the server's SINGLE_BUSINESS_SLUG).
  singleBusinessSlug: string | null;
}

const clean = (value: string | undefined) => value?.trim() || null;

export function getBrand(): Brand {
  const en = clean(process.env.BRAND_NAME) ?? "BookFlow";
  return {
    name: { en, ar: clean(process.env.BRAND_NAME_AR) ?? en },
    logoUrl: clean(process.env.BRAND_LOGO_URL),
    shareImageUrl: clean(process.env.BRAND_SHARE_IMAGE_URL) ?? "/og-default.png",
    singleBusinessSlug: clean(process.env.SINGLE_BUSINESS_SLUG)?.toLowerCase() ?? null,
  };
}

// For the privacy and terms pages: who runs the system and how long guest details are kept.
//   OPERATOR_NAME            who runs the booking system (shown on the privacy page)
//   OPERATOR_EMAIL           where people write about their data
//   DATA_RETENTION_MONTHS    keep it equal to the server's (default 12)
export function getLegalSettings() {
  const months = Number(clean(process.env.DATA_RETENTION_MONTHS));
  return {
    operator: clean(process.env.OPERATOR_NAME),
    email: clean(process.env.OPERATOR_EMAIL),
    retentionMonths: Number.isFinite(months) && months >= 1 ? Math.floor(months) : 12,
  };
}

// The site's public address, for absolute links in shared previews (metadataBase).
// SITE_URL when set; on Vercel the production domain (a client's own domain once added); else local.
export function getSiteUrl(): URL {
  const explicit = clean(process.env.SITE_URL);
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? clean(process.env.VERCEL_URL);
  try {
    if (explicit) return new URL(explicit);
    if (vercel) return new URL(`https://${vercel}`);
  } catch {
    console.warn(`[brand] SITE_URL "${explicit}" is not a valid URL - using the default.`);
  }
  return new URL("http://localhost:3000");
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
