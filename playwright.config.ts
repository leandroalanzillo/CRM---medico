import { defineConfig, devices } from "@playwright/test";

// Requires the app running against a REAL Supabase project with the two
// test accounts seeded (see scripts/seed-test-users.mjs). This suite
// cannot run in a sandbox with no network/Supabase access — it's meant to
// run in CI or locally against a dev/staging environment, e.g.:
//
//   E2E_BASE_URL=https://your-project.lovable.app npm run test:e2e
//
// or locally with `npm run dev` running in another terminal (this project's
// Vite dev server defaults to http://localhost:8080).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share one seeded clinic's data; parallel runs would race
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
