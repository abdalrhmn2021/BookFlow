const crypto = require("crypto");
const net = require("net");
const { SINGLE_BUSINESS_SLUG, SHARED_SERVER, SITE_PROXY_SECRET } = require("../config/mode");

// Headers set by the client site's proxy (client/src/proxy.ts). Keep the names in sync.
const SECRET_HEADER = "x-bookflow-proxy-secret";
const SITE_HEADER = "x-bookflow-site";
const CLIENT_IP_HEADER = "x-bookflow-client-ip";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Constant-time compare, so the secret can't be guessed one character at a time from response times.
function isProxySecret(value) {
  if (!SITE_PROXY_SECRET || typeof value !== "string") return false;
  const a = crypto.createHash("sha256").update(value).digest();
  const b = crypto.createHash("sha256").update(SITE_PROXY_SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

function cleanSlug(value) {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SLUG_REGEX.test(slug) && slug.length <= 40 ? slug : null;
}

// Runs before every route and answers two questions about the request:
//
//   req.siteLocked / req.siteSlug - is this site limited to ONE business, and which one?
//     platform:  siteLocked = false             (any business)
//     dedicated: siteLocked = true, the .env slug
//     shared:    siteLocked = true, the slug the site's proxy sent - or null when the request
//                did not come through one of our sites (then it may see NO business at all).
//
//   req.clientIp - the visitor's IP for the rate limits. Behind the Vercel proxy req.ip is
//     Vercel's server, so without this ALL visitors would share one limit.
//
// This is about showing each site only its own business. The real security boundary stays
// where it was: dashboard data is filtered by the logged-in user's tenantId.
exports.identifySite = (req, res, next) => {
  const fromOurSite = isProxySecret(req.get(SECRET_HEADER));

  if (SHARED_SERVER) {
    req.siteLocked = true;
    req.siteSlug = fromOurSite ? cleanSlug(req.get(SITE_HEADER)) : null;
  } else {
    req.siteLocked = Boolean(SINGLE_BUSINESS_SLUG);
    req.siteSlug = SINGLE_BUSINESS_SLUG;
  }

  const forwardedIp = fromOurSite ? req.get(CLIENT_IP_HEADER)?.trim() : null;
  req.clientIp = forwardedIp && net.isIP(forwardedIp) ? forwardedIp : req.ip;

  next();
};

// May this site show / book / log in to the business with this slug?
exports.siteAllows = (req, slug) => {
  if (!req.siteLocked) return true;
  return (
    Boolean(req.siteSlug) &&
    String(slug ?? "")
      .trim()
      .toLowerCase() === req.siteSlug
  );
};

// For public routes with :slug - another business is "not found" on this site.
exports.requireSiteBusiness = (req, res, next, slug) => {
  if (!exports.siteAllows(req, slug)) {
    return res.status(404).json({ message: "Business not found" });
  }
  next();
};

exports.OTHER_BUSINESS_MESSAGE = "This account belongs to another business";
exports.HEADERS = { SECRET_HEADER, SITE_HEADER, CLIENT_IP_HEADER };
