// How this server is used. Three set-ups, all from environment variables:
//
// 1. The public platform (default, the live demo): anyone can sign up a business,
//    and GET /api/public/businesses lists all of them.
//
// 2. A shared server for sold copies (one server, many clients):
//      ALLOW_BUSINESS_SIGNUP=false  -> nobody can create a business through the API
//                                      (new clients are added with `npm run setup-client`)
//      PUBLIC_DIRECTORY=false       -> no public list of businesses, so one client
//                                      can't see who your other clients are
//    Each client's own site (Vercel) shows only its business via the client's SINGLE_BUSINESS_SLUG.
//
// 3. A dedicated server for one client: SINGLE_BUSINESS_SLUG=<slug> limits the API to that business.

const isOff = (value) => ["false", "0", "no", "off"].includes(String(value).trim().toLowerCase());

const SINGLE_BUSINESS_SLUG = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase() || null;
const ALLOW_BUSINESS_SIGNUP = !isOff(process.env.ALLOW_BUSINESS_SIGNUP ?? "true");
const PUBLIC_DIRECTORY = !isOff(process.env.PUBLIC_DIRECTORY ?? "true");

module.exports = { SINGLE_BUSINESS_SLUG, ALLOW_BUSINESS_SIGNUP, PUBLIC_DIRECTORY };
