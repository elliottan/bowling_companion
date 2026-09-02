import { defineConfig, devices } from "@playwright/test";

// Two checkouts (a worktree beside the main tree) must not share a port:
// `reuseExistingServer` would point one tree's tests at the other tree's
// code. PORT picks the port, and strictPort makes Vite fail rather than drift
// to the next free one, which Playwright would then never find.
const port = Number(process.env.PORT ?? 5173);

// Smoke-test config, guarding core user flows rather than cross-browser
// rendering. Runs against the Vite dev server (no service worker, so
// reload-based state tests behave deterministically).
//
// Two browsers, not one. The launch crowd is bowlers on iPhones, which means
// Safari, and nothing ran there: every viewport quirk, every `dvh`, every
// sticky header and every date the app formats behaves differently under
// WebKit, and all of it shipped untested. It roughly doubles the suite's
// runtime, which is the price of the one browser most of these users have.
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
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    // The iPhone 13 descriptor, which brings the touch flag, the mobile user
    // agent and the 390x844 viewport the rest of the suite already assumes.
    { name: "webkit", use: { ...devices["iPhone 13"] } }
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
