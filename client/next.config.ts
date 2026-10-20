import type { NextConfig } from "next";

const API_ORIGIN = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
  "http://localhost:5000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Proxy /api to the Express server so the browser sees one origin and the httpOnly
  // auth cookie is first-party (cross-site cookies are blocked by Safari and others).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
