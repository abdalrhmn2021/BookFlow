// "Client edition": one install sold to one business. All values are set at build time (Vercel env vars).
//   NEXT_PUBLIC_BUSINESS_SLUG  same value as the server's SINGLE_BUSINESS_SLUG -> "/" opens its booking page,
//                              the directory and business sign-up disappear
//   NEXT_PUBLIC_BRAND_NAME     shown instead of "BookFlow" (navbar, tab title)
//   NEXT_PUBLIC_CURRENCY       price symbol, default ₪
export const BUSINESS_SLUG = process.env.NEXT_PUBLIC_BUSINESS_SLUG?.trim().toLowerCase() || null;
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "BookFlow";
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY?.trim() || "₪";

// Where "browse / book" links should go
export const BOOK_HREF = BUSINESS_SLUG ? `/book/${BUSINESS_SLUG}` : "/businesses";
