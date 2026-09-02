import { version as pkgVersion } from "./package.json";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** The clean URLs that build to a directory, and so need resolving by hand. */
const CLEAN_URLS = ["/score", "/legal"];

/**
 * Serve /score and /legal in dev the way the host serves them in production.
 *
 * Vercel resolves /score to score/index.html, but Vite's dev server only
 * resolves the directory form, /score/. Without this the app's real URL 404s
 * locally, the e2e suite has to ask for a URL no user will ever type, and dev
 * and prod disagree about the one path the whole app hangs off.
 */
function serveCleanUrls(): Plugin {
  return {
    name: "clean-urls",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        for (const path of CLEAN_URLS) {
          const url = req.url;
          if (url === path || url?.startsWith(`${path}#`) || url?.startsWith(`${path}?`)) {
            req.url = `${path}/index.html` + url.slice(path.length);
            break;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  // Baked in so a pasted bug report says which build it came from. The app has
  // no backend to ask, and a screenshot never carries it.
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16) + "Z")
  },
  // MPA, not SPA: the default SPA fallback answers *every* HTML request with
  // the root index.html, which would serve the landing page at /score and hide
  // the app entirely. There are two real HTML entries and no server routing to
  // fake, so the fallback is not wanted.
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        // The landing page a search engine and a link scraper read.
        landing: "index.html",
        // The app shell. Routing inside it is hash-based (see appRoute.ts), so
        // every screen is /score#/..., and this is the only app URL a server
        // ever sees.
        //
        // It builds to score/index.html but is linked, shared and installed as
        // /score. Hosts disagree about whether they resolve that themselves
        // (`vite preview` does not), so neither end is left to chance: the dev
        // server gets the middleware above, and production gets an explicit
        // rewrite in vercel.json. Both are inert where the host is already
        // right, and this is the one URL the whole app hangs off.
        app: "score/index.html",
        // Privacy, terms and trademark notices. Static like the landing page,
        // and deliberately not part of the app bundle: it is a page a store
        // reviewer, a crawler and a manufacturer's lawyer must be able to read
        // without running any JavaScript.
        legal: "legal/index.html"
      },
      output: {
        /**
         * Explicit lists, never a function over `id.includes("node_modules")`.
         * A catch-all vendor rule would pull `@dnd-kit` out of the Arsenal's
         * lazy chunk and into a bundle every visitor downloads, which is the
         * opposite of what this is for.
         *
         * React and Dexie are split out because they change only when they are
         * upgraded. An app-only deploy then re-downloads the app chunk and
         * leaves both of these in the service worker's precache, so an
         * installed user pays roughly 75KB gzip less per deploy.
         */
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client", "scheduler"],
          dexie: ["dexie", "dexie-react-hooks"]
        }
      }
    }
  },
  plugins: [
    serveCleanUrls(),
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
        // Points at the app, not at the landing page: this is what opens when
        // the home screen icon is tapped, and an installed user tapping their
        // own icon must never land on a pitch for the app they installed.
        start_url: "/score",
        // Scope stays the whole origin even though the app lives under /score.
        // A browser only offers to install from a page inside scope, and the
        // landing page is where a first visitor decides to install, so scoping
        // to /score would put the install prompt behind a click. The usual cost
        // of the wide scope, the landing page opening inside the app window, is
        // already handled: that page bounces a standalone launch to /score.
        scope: "/",
        categories: ["sports", "utilities"],
        icons: [
          // `purpose: "any"` is stated rather than left to the default, because
          // a manifest that names a maskable icon and no explicit "any" lets a
          // launcher use the maskable one everywhere, padding included.
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          // Android themed icons: recoloured to the wallpaper palette, so it
          // must be one colour on transparency.
          {
            src: "icons/icon-512-monochrome.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "monochrome"
          }
        ],
        // The richer install sheet on Android: without screenshots it shows a
        // single line of text, with them it shows the app.
        screenshots: [
          {
            src: "shots/scorer.webp",
            sizes: "780x1688",
            type: "image/webp",
            form_factor: "narrow",
            label: "Scoring a game frame by frame"
          },
          {
            src: "shots/line.webp",
            sizes: "780x1688",
            type: "image/webp",
            form_factor: "narrow",
            label: "The line you threw, drawn on the lane"
          },
          {
            src: "shots/stats.webp",
            sizes: "780x1688",
            type: "image/webp",
            form_factor: "narrow",
            label: "Averages, strike and spare rates over time"
          },
          {
            src: "shots/arsenal.webp",
            sizes: "780x1688",
            type: "image/webp",
            form_factor: "narrow",
            label: "Your arsenal, with the specs of every ball"
          }
        ],
        shortcuts: [
          { name: "Start session", url: "/score#/home", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "Stats", url: "/score#/stats", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] }
        ]
      },
      workbox: {
        // Offline navigations to /score (no trailing slash) are not a precache
        // URL, so without this they would fall through to the root index.html
        // and the app would look like it had been replaced by its own advert.
        // "/" is denied because it *is* precached, via workbox's directoryIndex.
        //
        // /legal is denied for the opposite reason: it is a real page and not
        // the app, but as a clean URL it is not a precache entry either, so the
        // fallback answered it with the app shell. Anyone tapping "Privacy and
        // terms" landed on the dashboard with /legal still in the address bar.
        navigateFallback: "/score/index.html",
        navigateFallbackDenylist: [/^\/$/, /^\/legal(\/|$)/],
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
          },
          {
            // The legal page, which the fallback denylist above hands to the
            // network. NetworkFirst so it is still readable offline once seen,
            // rather than being the one page in an offline-first app that needs
            // a connection.
            urlPattern: /\/legal(\/|$)/,
            handler: "NetworkFirst",
            options: { cacheName: "legal-page", networkTimeoutSeconds: 5 }
          },
          {
            // The landing page's screenshots. They follow the same rule as the
            // catalog images (webp stays out of precache to keep boot light),
            // but the landing page is served from the cache, so without this it
            // would come back offline with two holes where the app used to be.
            urlPattern: /\/shots\/.*\.webp$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "landing-shots" }
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
        "src/services/**": { lines: 83, functions: 80, branches: 68 },
        // Views and components have floors now, which they did not before, and
        // the point is that a floor exists rather than that it is high: it
        // stops the five screens that carry the data-loss risks from quietly
        // going back to zero. Measured at views 34/21/24 and components
        // 62/52/59; set a few points under each so a refactor that moves a
        // branch around does not fail the build.
        "src/views/**": { lines: 30, functions: 18, branches: 21 },
        "src/components/**": { lines: 58, functions: 48, branches: 55 }
      }
    }
  }
});
