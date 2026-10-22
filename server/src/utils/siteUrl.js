// The site a link in an email should open. With several sites on one server (CLIENT_URL is a
// comma-separated list), use the one the request came from if it's on the list, else the first.
function siteUrl(req) {
  const allowed = (process.env.CLIENT_URL || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const origin = req?.get("origin")?.replace(/\/$/, "");
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] || null;
}

module.exports = { siteUrl };
