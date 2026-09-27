// Demo accounts created by `npm run seed` (server/scripts/seed.js).
// They are PUBLIC on purpose: a recruiter should be able to try the app in one click
// without creating an account. Never put real credentials in frontend code -
// everything here ends up in the JavaScript that every visitor downloads.
//
// Turn the buttons off with NEXT_PUBLIC_DEMO_MODE=false (e.g. for a real production launch).

export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export const DEMO_PASSWORD = "password123";

export const DEMO_ACCOUNTS = {
  customer: "customer@demo.com",
  owner: "owner@demo.com",
  staff: "sara@demo.com",
} as const;
