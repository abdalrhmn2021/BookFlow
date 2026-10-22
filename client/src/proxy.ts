import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /api/* is forwarded to the Express server (next.config.ts). On the way, tell the server who
// the visitor really is: Vercel sets x-real-ip to the visitor's IP and overwrites any value the
// browser sent, so it can't be faked. PROXY_SECRET (same value on Vercel and Render) proves to
// the server that the header came from here. Without it, the server rate-limits per Vercel IP.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-bookflow-client-ip");
  headers.delete("x-bookflow-proxy-secret");

  // Only x-real-ip: off Vercel, x-forwarded-for can carry whatever the browser sent.
  const ip = request.headers.get("x-real-ip")?.trim();
  const secret = process.env.PROXY_SECRET;
  if (ip && secret) {
    headers.set("x-bookflow-client-ip", ip);
    headers.set("x-bookflow-proxy-secret", secret);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
