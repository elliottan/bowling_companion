import { defineConfig, devices } from "@playwright/test";

// Two checkouts (a worktree beside the main tree) must not share a port:
// `reuseExistingServer` would point one tree's tests at the other tree's
// code. PORT picks the port, and strictPort makes Vite fail rather than drift
// to the next free one, which Playwright would then never find.
const port = Number(process.env.PORT ?? 5173);

// The production build, served by `vite preview`, for the one spec that needs
// a service worker (e2e/offline-boot.spec.ts). Only when the caller says
// `dist/` is a fresh build of this tree: `verify` sets E2E_BUILT right after
// its build, and so does CI's Chromium job. Without it the project and its
// server are left out, so a run that did not build never tests a stale one.
const built = process.env.E2E_BUILT === "1";
const previewPort = Number(process.env.PREVIEW_PORT ?? 4173);

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
  // One retry everywhere, not only on CI. `verify` exists to run exactly what
  // CI runs (AGENTS.md), and a gate that is stricter than the judge sends you
  // hunting a failure the judge would have passed: a WebKit page late in the
  // run occasionally never fires `load` on the next test's first navigation,
  // which reproduces at the 51st test of 52 and not in any smaller subset. It
  // is tracked in docs/ROADMAP.md rather than papered over silently.
  retries: 1,
  // Two at a time. Each test has a browser context of its own, so its own
  // IndexedDB, and nothing else is shared but the dev server. One at a time
  // was the default this started from rather than a need, and it was most of
  // the wall clock. Files are spread across the workers; a file's tests still
  // run in order (fullyParallel above).
  workers: 2,
  // On CI, `github` as well: a test that only passed on its retry is green in
  // the list and easy to miss in a long log, so it is also raised as a warning
  // on the run's summary. Two WebKit tests did exactly that unseen once.
  reporter: process.env.CI ? [["list"], ["github"]] : "line",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /offline-boot\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } }
    },
    // The iPhone 13 descriptor, which brings the touch flag, the mobile user
    // agent and the 390x844 viewport the rest of the suite already assumes.
    { name: "webkit", testIgnore: /offline-boot\.spec\.ts/, use: { ...devices["iPhone 13"] } },
    // Chromium only: it is the engine Playwright can take offline with a
    // service worker in charge of the page.
    ...(built
      ? [
          {
            name: "offline-boot",
            testMatch: /offline-boot\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 390, height: 844 },
              baseURL: `http://localhost:${previewPort}`
            }
          }
        ]
      : [])
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    ...(built
      ? [
          {
            command: `npx vite preview --port ${previewPort} --strictPort`,
            url: `http://localhost:${previewPort}/app/`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000
          }
        ]
      : [])
  ]
});
