import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The store app: the web build inside Capacitor (ADR-155). `npm run build:ios`
 * builds the web app, assembles `dist-native/` from it
 * (`scripts/native/assemble.ts`) and copies that into `ios/`.
 */
const config: CapacitorConfig = {
  // headpin.app, reversed. It is the app's identity in the App Store and on
  // every device, and the bowler's database lives under it, so like the web
  // manifest's `id` it cannot be changed once anyone has installed.
  appId: "app.headpin",
  appName: "Headpin",
  webDir: "dist-native",
  ios: {
    // The page runs edge to edge and keeps its own safe-area padding, as the
    // installed web app does with `viewport-fit=cover`, so the web view adds
    // no inset of its own (docs/VIEWPORT-BUG.md).
    contentInset: "never",
    // The cream behind the page before it paints, so a launch does not flash
    // white between the splash screen and the first frame.
    backgroundColor: "#fff8ed"
  }
};

export default config;
