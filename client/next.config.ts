import type { NextConfig } from "next";

const API_ORIGIN = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
  "http://localhost:5000"
).replace(/\/$/, "");

const BUSINESS_SLUG = process.env.NEXT_PUBLIC_BUSINESS_SLUG?.trim().toLowerCase();

const nextConfig: NextConfig = {
  // Client edition: the platform pages lead straight to the one business's booking page.
  async redirects() {
    if (!BUSINESS_SLUG) return [];
    return ["/", "/businesses", "/register-business"].map((source) => ({
      source,
      destination: `/book/${BUSINESS_SLUG}`,
      permanent: false,
    }));
  },
  // Proxy /api to the Express server so the browser sees one origin and the httpOnly
  // auth cookie is first-party (cross-site cookies are blocked by Safari and others).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
