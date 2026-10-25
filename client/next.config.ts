import type { NextConfig } from "next";
import { API_ORIGIN } from "./src/lib/apiOrigin";

// One-business copy: the same slug as the server's SINGLE_BUSINESS_SLUG.
const SINGLE_BUSINESS_SLUG = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase() || null;

const nextConfig: NextConfig = {
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
