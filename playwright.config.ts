import { defineConfig, devices } from "@playwright/test";

// Two checkouts (a worktree beside the main tree) must not share a port:
// `reuseExistingServer` would point one tree's tests at the other tree's
// code. PORT picks the port, and strictPort makes Vite fail rather than drift
// to the next free one, which Playwright would then never find.
const port = Number(process.env.PORT ?? 5173);

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
    baseURL: `http://localhost:${port}`,
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
