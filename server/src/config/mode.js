// Set SINGLE_BUSINESS_SLUG to run one business per install (no sign-ups, one listing).
const SINGLE_BUSINESS_SLUG = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase() || null;

module.exports = { SINGLE_BUSINESS_SLUG };
