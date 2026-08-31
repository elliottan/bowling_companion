import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png"],
      manifest: {
        // `id` pins the app's identity independently of `start_url`. Without
        // it a browser derives identity from the start URL, so changing that
        // path later would register as a *different* app: a second icon, and a
        // second origin-scoped database the user cannot see their history in.
        // It cannot be retrofitted safely once anyone has installed.
        id: "/",
        name: "Headpin",
        short_name: "Headpin",
        description: "Offline bowling score keeper. Your scores stay on your phone.",
        theme_color: "#1b5148",
        background_color: "#fff8ed",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // NOTE: webp and catalog JSON are intentionally excluded from precache
        // to keep boot light. They are runtime-cached on first use instead.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        runtimeCaching: [
          {
            // NetworkFirst (not SWR): online clients must read the *current*
            // manifest/catalog so a freshly deployed catalog syncs on the first
            // refresh instead of lagging a version behind. Cache is the offline
            // fallback.
            urlPattern: /\/catalog\/catalog-manifest\.json$/,
            handler: "NetworkFirst",
            options: { cacheName: "catalog-manifest", networkTimeoutSeconds: 5 }
          },
          {
            urlPattern: /\/catalog\/catalog\.json$/,
            handler: "NetworkFirst",
            options: { cacheName: "catalog-data", networkTimeoutSeconds: 5 }
          },
          {
            urlPattern: /\/catalog\/img\/.*\.webp$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "catalog-images" }
          }
        ]
      }
    })
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      // Only the app ships. `scripts/` is offline catalog tooling run by hand,
      // and screens are covered by Playwright rather than jsdom.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test/**", "src/**/*.test.{ts,tsx}"],
      // Floors, not targets: the scoring engine, the geometry and the
      // repositories are where a regression corrupts a user's data, and there
      // is no backend to restore it from. They stay covered.
      //
      // Set a few points under what the suite measures today (lib 93/94/85,
      // services 87/83/71). Vitest 4 counts branches differently to Vitest 2,
      // so these numbers are not comparable to the ones set before that
      // upgrade: the tests did not change, the accounting did.
      thresholds: {
        "src/lib/**": { lines: 90, functions: 90, branches: 82 },
        "src/services/**": { lines: 83, functions: 80, branches: 68 }
      }
    }
  }
});
