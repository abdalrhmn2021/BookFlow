import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (npm run test:e2e): Playwright starts both servers, runs e2e/*.spec.ts in
// Chromium, and stops them. The API runs on a throwaway in-memory database with the demo data
// (server/scripts/e2e-server.js), so nothing touches your real database.
// First time on a computer: npx playwright install chromium
const API_PORT = 5055;
const WEB_PORT = 3055;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    timezoneId: "Asia/Hebron",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node ../server/scripts/e2e-server.js",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), CLIENT_URL: `http://127.0.0.1:${WEB_PORT}` },
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      // A production build pointed at the test API. Empty values override client/.env.local.
      command: `npm run build && npm run start -- -p ${WEB_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      env: {
        API_URL: `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_API_URL: "",
        SINGLE_BUSINESS_SLUG: "",
        SITE_PROXY_SECRET: "",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
        NEXT_PUBLIC_DEMO_MODE: "true",
        CSRF_CHECK: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
