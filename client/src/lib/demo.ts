export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export const DEMO_PASSWORD = "password123";

export const DEMO_ACCOUNTS = {
  customer: "customer@demo.com",
  owner: "owner@demo.com",
  staff: "sara@demo.com",
} as const;
