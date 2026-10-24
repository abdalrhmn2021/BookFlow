// How this server is installed. Three ways:
//
//   1. Platform (the demo)        - nothing set. Many businesses, open sign-ups, a public directory.
//   2. Dedicated server           - SINGLE_BUSINESS_SLUG=laila-salon. One server + database per client.
//   3. Shared server (sold copies) - SHARED_SERVER=true. ONE server + database for ALL clients;
//      every client has its own branded site (Vercel), and that site's proxy tells the server
//      which business it is (see middlewares/site.middleware.js). Business sign-up is closed:
//      new clients are added with `npm run setup-client`.
//
// SITE_PROXY_SECRET is shared between this server and the sites (client/src/proxy.ts).
// A request that carries it really came through one of OUR sites, so we can trust the
// business slug and the visitor's IP it sends. Required in shared mode, optional otherwise
// (it still gives the rate limits the visitor's real IP instead of Vercel's).

const clean = (value) => value?.trim() || null;

const SINGLE_BUSINESS_SLUG = clean(process.env.SINGLE_BUSINESS_SLUG)?.toLowerCase() || null;
const SHARED_SERVER = clean(process.env.SHARED_SERVER)?.toLowerCase() === "true";
const SITE_PROXY_SECRET = clean(process.env.SITE_PROXY_SECRET);

const MIN_SECRET_LENGTH = 32;

// Called once at start-up (server.js). Returns a list of problems - empty means OK.
function checkModeConfig() {
  const problems = [];
  if (SHARED_SERVER && SINGLE_BUSINESS_SLUG) {
    problems.push("Set SHARED_SERVER or SINGLE_BUSINESS_SLUG, not both (a shared server serves many businesses).");
  }
  if (SHARED_SERVER && !SITE_PROXY_SECRET) {
    problems.push("SHARED_SERVER=true needs SITE_PROXY_SECRET (the same value on every client site).");
  }
  if (SITE_PROXY_SECRET && SITE_PROXY_SECRET.length < MIN_SECRET_LENGTH) {
    problems.push(`SITE_PROXY_SECRET is too short (< ${MIN_SECRET_LENGTH} chars).`);
  }
  return problems;
}

module.exports = { SINGLE_BUSINESS_SLUG, SHARED_SERVER, SITE_PROXY_SECRET, checkModeConfig };
