import { defineConfig, devices } from "@playwright/test";

// Smoke-test config. Chromium only — these guard core user flows, not
// cross-browser rendering. Runs against the Vite dev server (no service
// worker, so reload-based state tests behave deterministically).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
