import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Bowling Companion",
        short_name: "Bowling",
        description: "Offline bowling score keeper",
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
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"]
  }
});
