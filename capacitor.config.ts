import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The store apps: the web build inside Capacitor (ADR-155). `npm run build:ios`
 * and `npm run build:android` build the web app, assemble `dist-native/` from
 * it (`scripts/native/assemble.ts`) and copy that into `ios/` or `android/`.
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
  },
  android: {
    backgroundColor: "#fff8ed"
  },
  plugins: {
    SystemBars: {
      // Android draws the app edge to edge (it is required from Android 15).
      // "native" leaves the page to pad itself from env(safe-area-inset-*), as
      // it already does on iOS and in the installed web app; Capacitor only
      // pads the web view for itself on a Chromium too old to report them.
      insetsHandling: "native",
      // The shell's viewport is `viewport-fit=cover`, so say so up front
      // rather than let the first frame lay out without the insets.
      initialViewportFitValueHint: "cover"
    }
  }
};

export default config;
