/**
 * A dry run of the device check in desktop Chromium, for writing and fixing
 * the walk without a simulator or an emulator (ADR-155).
 *
 *   npm run build && tsx scripts/native/assemble.ts
 *   tsx scripts/native/device-check/web.ts [--out dir]
 *
 * It serves `dist-native/` the way the app does, at the root, and stands in
 * for the native side with Capacitor's custom-platform hook: the app believes
 * it is in a store app, and the Share and Filesystem plugins answer from here.
 * It proves the walk and the page, never the platform: back, the share sheet
 * and a relaunch are imitations. Those are what the real runs are for.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";
import type { Driver } from "./driver";
import { runFlow } from "./flow";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const ROOT = "dist-native";
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

/**
 * The native side, at the layer the real one answers on: plugin headers, and
 * `nativePromise` for every call. That is the layer the walk watches, so the
 * dry run takes the same path through the app as a phone does. The share sheet
 * is "closed" at once, as a bowler might.
 */
const FAKE_NATIVE = `
  window.CapacitorCustomPlatform = { name: "dry-run", plugins: {} };
  window.Capacitor = Object.assign(window.Capacitor || {}, {
    // The real bridge defines this before the page runs; @capacitor/core
    // replaces it with its own once a plugin loads, and the custom platform's
    // name keeps that one answering native too.
    isNativePlatform: () => true,
    PluginHeaders: [
      { name: "Filesystem", methods: [{ name: "writeFile", rtype: "promise" }] },
      { name: "Share", methods: [{ name: "share", rtype: "promise" }] }
    ],
    nativePromise: async (plugin, method, options) => {
      if (plugin === "Filesystem" && method === "writeFile") return { uri: "file:///cache/" + options.path };
      if (plugin === "Share") throw new Error("Share canceled");
      throw new Error(plugin + "." + method + " has no stand-in in the dry run");
    }
  });
`;

async function main() {
  if (!existsSync(join(ROOT, "index.html"))) throw new Error(`Build ${ROOT}/ first: npm run build && tsx scripts/native/assemble.ts`);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split(/[?#]/)[0])).replace(/^(\.\.[/\\])+/, "");
    let file = join(ROOT, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(4310, "127.0.0.1", r));

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addInitScript(FAKE_NATIVE);
  // No network beyond the app itself, as at an alley with no signal.
  await context.route(/^https:\/\//, (route) => route.abort());
  let page = await context.newPage();
  await page.goto("http://127.0.0.1:4310/");
  let inForeground = true;

  const driver: Driver = {
    platform: "android",
    evaluate: (expression) => page.evaluate(expression),
    tapAt: (x, y) => page.touchscreen.tap(x, y),
    type: (text) => page.keyboard.type(text),
    async systemBack() {
      // Android's back steps through the web view's history and leaves the
      // app from its first entry (MainActivity).
      const canGoBack = await page.evaluate(() => history.length > 1 && location.hash !== "" && location.hash !== "#/home");
      if (canGoBack) await page.goBack().catch(() => {});
      else inForeground = false;
    },
    dismissSystemSheet: async () => {},
    appInForeground: async () => inForeground,
    async relaunch() {
      await page.close();
      page = await context.newPage();
      await page.goto("http://127.0.0.1:4310/");
      inForeground = true;
    },
    // Cutting the network here would cut off the server the page comes from,
    // which the app never needs; the dry run has no signal to cut anyway.
    setOnline: async () => false,
    screenshot: async (path) => {
      await page.screenshot({ path });
    },
    close: async () => {
      await browser.close();
      server.close();
    }
  };

  const ok = await runFlow(driver, value("out", "device-check-out/web"), { slow: 1, online: false });
  await driver.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
