const crypto = require("crypto");
const net = require("net");

// The site sends /api through Vercel (client/next.config.ts), so req.ip is a Vercel address
// shared by many visitors. client/src/proxy.ts passes the visitor's real IP in IP_HEADER,
// together with PROXY_SECRET. Without the right secret the header is ignored, so someone
// calling the API directly can't pick a fake IP to dodge the rate limits.
const IP_HEADER = "x-bookflow-client-ip";
const SECRET_HEADER = "x-bookflow-proxy-secret";

function sameSecret(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  const forwarded = req.get(IP_HEADER)?.trim();
  if (forwarded && net.isIP(forwarded) && sameSecret(req.get(SECRET_HEADER), process.env.PROXY_SECRET)) {
    return forwarded;
  }
  return req.ip;
}

module.exports = { clientIp, IP_HEADER, SECRET_HEADER };
