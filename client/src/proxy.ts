import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Runs on every page request (Content-Security-Policy with a nonce, below) and on every /api
// request, just before next.config.ts forwards it to the Express server.
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

// Content-Security-Policy for the pages (security review: XSS, F-01 follow-up). Each page answer
// gets a new random nonce: only scripts carrying it may run - the ones Next.js writes into the page
// (it reads the nonce from the request header set below and adds it to them) and the scripts they
// load ('strict-dynamic', e.g. Cloudflare Turnstile). A script injected into the page by an attacker
// has no nonce and is blocked. The root layout reads cookies, so every page is already rendered per
// request: the nonce costs nothing extra.
//   CSP=report-only  the browser only reports what it would block (console), blocks nothing
//   CSP=off          only the basic rules (no frames, no plugins, no <base>, forms to us)
const BASIC_CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const TURNSTILE = "https://challenges.cloudflare.com";

export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' and ws: only for `next dev` (fast refresh); never in a production build.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE}${dev ? " 'unsafe-eval'" : ""}`,
    // Inline styles stay allowed (React style={...}, next/font): they can't run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${TURNSTILE}${dev ? " ws: wss:" : ""}`,
    `frame-src ${TURNSTILE}`,
    BASIC_CSP,
  ].join("; ");
}

function pageWithCsp(request: NextRequest) {
  const mode = process.env.CSP?.trim().toLowerCase();
  if (mode === "off") {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", BASIC_CSP);
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp); // Next.js takes the nonce for its scripts from here

  const response = NextResponse.next({ request: { headers } });
  if (mode === "report-only") {
    response.headers.set("Content-Security-Policy", BASIC_CSP);
    response.headers.set("Content-Security-Policy-Report-Only", csp);
  } else {
    response.headers.set("Content-Security-Policy", csp);
  }
  return response;
}

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return pageWithCsp(request);

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
  matcher: [
    "/api/:path*",
    // Pages (for the CSP) - not Next.js's own files, images or prefetches.
    {
      source:
        "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
