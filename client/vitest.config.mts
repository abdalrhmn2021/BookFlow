import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the pure parts of the site (npm test): links, redirects, dates, the CSRF guard.
// The pages themselves are covered by the end-to-end tests in e2e/ (npm run test:e2e).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
