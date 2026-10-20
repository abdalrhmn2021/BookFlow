import { BUSINESS_SLUG } from "./edition";

export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export const DEMO_PASSWORD = "password123";

type DemoRole = "customer" | "owner" | "staff";

// The demo sign-in buttons. A client-edition demo (e.g. al-ward) uses the <role>@<slug>.demo accounts
// created by the server's demo seed.
export const DEMO_ACCOUNTS: Record<DemoRole, string> = BUSINESS_SLUG
  ? {
      customer: `customer@${BUSINESS_SLUG}.demo`,
      owner: `owner@${BUSINESS_SLUG}.demo`,
      staff: `staff@${BUSINESS_SLUG}.demo`,
    }
  : {
      customer: "customer@demo.com",
      owner: "owner@demo.com",
      staff: "sara@demo.com",
    };
