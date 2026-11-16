import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Runs on every /api request, just before next.config.ts forwards it to the Express server.
// It tells the server who is asking (keep the header names in sync with
// server/src/middlewares/site.middleware.js):
//
//   x-bookflow-proxy-secret  proves the request came through one of OUR sites (SITE_PROXY_SECRET)
//   x-bookflow-site          which business this site is (SINGLE_BUSINESS_SLUG)
//   x-bookflow-client-ip     the visitor's IP - without it the server only sees Vercel's IP,
//                            and every visitor would share the same rate limit
//
// These headers go server-to-server only; the browser never sees the secret.
const SECRET_HEADER = "x-bookflow-proxy-secret";
const SITE_HEADER = "x-bookflow-site";
const CLIENT_IP_HEADER = "x-bookflow-client-ip";

function visitorIp(request: NextRequest): string | null {
  // Only x-real-ip: Vercel sets it to the visitor's IP and overwrites whatever the browser sent.
  // x-forwarded-for is not used - off Vercel it can carry any value the browser chose.
  return request.headers.get("x-real-ip")?.trim() || null;
}

// CSRF guard (security review C-04). A browser request that CHANGES something (POST, PUT,
// PATCH, DELETE) must come from a page on this same site. Another site's page can make the
// browser send our login cookie with its request - this stops it here, before the server.
// Today SameSite=Lax and the JSON-only body already block that; this keeps it blocked even if
// one of them changes. It compares with the site's own domain, so every site (custom domains
// too) works with no list to keep up to date. No Origin header = not sent by a page (curl, apps).
// CSRF_CHECK=off turns it off.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method) || process.env.CSRF_CHECK?.trim().toLowerCase() === "off") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = (request.headers.get("host") || request.nextUrl.host).toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true; // "null" (sandboxed iframe, file://) or garbage
  }
}

export function proxy(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
  }

  const headers = new Headers(request.headers);

  // Whatever the browser sent under these names is thrown away - only we set them.
  headers.delete(SECRET_HEADER);
  headers.delete(SITE_HEADER);
  headers.delete(CLIENT_IP_HEADER);

  const secret = process.env.SITE_PROXY_SECRET?.trim();
  if (secret) {
    headers.set(SECRET_HEADER, secret);

    const slug = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase();
    if (slug) headers.set(SITE_HEADER, slug);

    const ip = visitorIp(request);
    if (ip) headers.set(CLIENT_IP_HEADER, ip);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
