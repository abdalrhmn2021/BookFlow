import path from "node:path";
import type { NextConfig } from "next";
import { API_ORIGIN } from "./src/lib/apiOrigin";

// One-business copy: the same slug as the server's SINGLE_BUSINESS_SLUG.
const SINGLE_BUSINESS_SLUG = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase() || null;

// Security headers for every page (security review F-01). The /api answers get their own from
// helmet on the Express server. Pages had none, so another site could show ours in an iframe.
//   frame-ancestors 'none' + X-Frame-Options: no site (ours included) may put a page in a frame
//   object-src / base-uri / form-action: no plugins, no <base> swap, forms post only to us
// There is no script-src on purpose: Next.js adds inline scripts, and allowing them safely needs a
// nonce on every request. Add it later as Content-Security-Policy-Report-Only first, and allow
// https://challenges.cloudflare.com (Turnstile) in script-src and frame-src.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" on every answer.
  poweredByHeader: false,

  // The repo root has its own package-lock.json (Prettier only): without this Next.js guesses the
  // root and warns on every build. The site is this folder.
  turbopack: { root: path.join(__dirname) },

  async headers() {
    // Every page, but not /api: those answers come from the Express server with helmet's headers.
    return [{ source: "/((?!api/).*)", headers: SECURITY_HEADERS }];
  },

  // Proxy /api to the Express server so the browser sees one origin and the httpOnly
  // auth cookie is first-party (cross-site cookies are blocked by Safari and others).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },

  // In a one-business copy the "platform" pages make no sense:
  //   /                   (landing page for all businesses) -> straight to the booking page
  //   /businesses         (directory of businesses)         -> the booking page
  //   /register-business  (sign up a new business)          -> login (the owner already exists)
  // permanent: false (307) so browsers don't remember it if the copy is ever switched back.
  async redirects() {
    if (!SINGLE_BUSINESS_SLUG) return [];
    const bookingPage = `/book/${SINGLE_BUSINESS_SLUG}`;
    return [
      { source: "/", destination: bookingPage, permanent: false },
      { source: "/businesses", destination: bookingPage, permanent: false },
      { source: "/register-business", destination: "/login", permanent: false },
    ];
  },
};

export default nextConfig;
