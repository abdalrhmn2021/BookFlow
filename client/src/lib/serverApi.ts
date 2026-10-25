import "server-only";
import { API_ORIGIN } from "@/lib/apiOrigin";
import type { PublicBusinessPage } from "@/lib/types";

// Fetches from the Express server ON THE NEXT.JS SERVER (page metadata), not from the browser.
// The browser's /api requests get the site headers from proxy.ts; these don't go through it,
// so they add the same headers themselves (a shared server shows a business only to its own site).
function siteHeaders(): Record<string, string> {
  const secret = process.env.SITE_PROXY_SECRET?.trim();
  if (!secret) return {};
  const slug = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase();
  return { "x-bookflow-proxy-secret": secret, ...(slug && { "x-bookflow-site": slug }) };
}

export type BusinessLookup =
  | { status: "found"; page: PublicBusinessPage }
  | { status: "not-found" }
  | { status: "unavailable" }; // server asleep, slow or down: callers fall back to generic text

// timeoutMs: a sleeping free-tier server can take ~50 s to wake up. A visitor's page must not wait
// for that, so it gets generic metadata; link-preview crawlers get longer (see book/[slug]/layout).
export async function getPublicBusiness(slug: string, timeoutMs: number): Promise<BusinessLookup> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/public/businesses/${encodeURIComponent(slug)}`, {
      headers: siteHeaders(),
      // Cached 5 minutes per business: shares and visits don't hit the API (or its rate limit) each time.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) return { status: "unavailable" };
    return { status: "found", page: (await res.json()) as PublicBusinessPage };
  } catch {
    return { status: "unavailable" };
  }
}
