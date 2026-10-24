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
  // On Vercel both are set by Vercel itself (a browser can't fake them).
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function proxy(request: NextRequest) {
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
