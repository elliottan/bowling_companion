/**
 * The device check on an iOS simulator, through Appium (ADR-155).
 *
 * Run by `.github/workflows/ios-device-check.yml` on a macOS runner, since the
 * simulator only exists on a Mac. Expects Appium on 127.0.0.1:4723 with the
 * XCUITest driver, a booted simulator, and the app built for it:
 *
 *   tsx scripts/native/device-check/ios.ts --app path/to/App.app --udid <sim>
 *
 * Script runs in the app's WKWebView (a debug build is inspectable); taps,
 * typing and the edge swipe are real touches sent by XCUITest, so they are
 * hit-tested by iOS the way a finger is.
 */
import { remote } from "webdriverio";
import type { Driver } from "./driver";
import { runFlow } from "./flow";

const BUNDLE = "app.headpin";
const args = process.argv.slice(2);
const value = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = value("app");
  const udid = value("udid");
  if (!app || !udid) throw new Error("--app and --udid are required");
  const out = value("out", "device-check-out/ios")!;

  const browser = await remote({
    hostname: "127.0.0.1",
    port: 4723,
    logLevel: "warn",
    connectionRetryTimeout: 600_000,
    capabilities: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:udid": udid,
      "appium:app": app,
      "appium:bundleId": BUNDLE,
      "appium:noReset": false,
      "appium:newCommandTimeout": 600,
      "appium:wdaLaunchTimeout": 600_000,
      "appium:wdaConnectionTimeout": 600_000,
      "appium:webviewConnectTimeout": 120_000
    }
  });

  let webview: string | null = null;
  async function toWebview() {
    for (let i = 0; i < 120; i++) {
      const contexts = (await browser.getContexts()) as (string | { id: string })[];
      const id = contexts.map((c) => (typeof c === "string" ? c : c.id)).find((c) => c.startsWith("WEBVIEW"));
      if (id) {
        webview = id;
        await browser.switchContext(id);
        return;
      }
      await sleep(1000);
    }
    throw new Error("The app's web view never became inspectable");
  }
  async function native<T>(fn: () => Promise<T>): Promise<T> {
    await browser.switchContext("NATIVE_APP");
    try {
      return await fn();
    } finally {
      if (webview) await browser.switchContext(webview);
    }
  }
  const touch = (points: { x: number; y: number; ms: number }[]) =>
    browser.performActions([
      {
        type: "pointer",
        id: "finger",
        parameters: { pointerType: "touch" },
        actions: [
          { type: "pointerMove", duration: 0, x: Math.round(points[0].x), y: Math.round(points[0].y) },
          { type: "pointerDown", button: 0 },
          ...points.slice(1).map((p) => ({ type: "pointerMove", duration: p.ms, x: Math.round(p.x), y: Math.round(p.y) })),
          { type: "pause", duration: 50 },
          { type: "pointerUp", button: 0 }
        ]
      }
    ]);

  await toWebview();

  const driver: Driver = {
    platform: "ios",
    async evaluate<T>(expression: string): Promise<T> {
      const result = (await browser.executeAsync((expr: string, done: (v: unknown) => void) => {
        Promise.resolve()
          .then(() => (0, eval)(expr))
          .then(
            (v) => done({ v }),
            (e) => done({ e: String(e) })
          );
      }, expression)) as { v?: T; e?: string };
      if (result && result.e) throw new Error(result.e);
      return result?.v as T;
    },
    // The web view fills the screen from its top-left corner (contentInset
    // "never"), so a CSS pixel is a point on the screen.
    tapAt: (x, y) => native(() => touch([{ x, y, ms: 0 }])),
    type: (text) => native(() => browser.keys(text.split(""))),
    async systemBack() {
      const { width, height } = await native(() => browser.getWindowSize());
      await native(() =>
        touch([
          { x: 1, y: height / 2, ms: 0 },
          { x: width * 0.7, y: height / 2, ms: 350 }
        ])
      );
      await sleep(800);
    },
    async appInForeground() {
      const state = await native(() => browser.execute("mobile: queryAppState", { bundleId: BUNDLE }));
      return state === 4;
    },
    async relaunch() {
      await native(async () => {
        await browser.execute("mobile: terminateApp", { bundleId: BUNDLE });
        await browser.execute("mobile: launchApp", { bundleId: BUNDLE });
      });
      webview = null;
      await toWebview();
    },
    // A simulator shares the Mac's network; there is no switch to cut it.
    setOnline: async () => false,
    async screenshot(path) {
      await native(() => browser.saveScreenshot(path));
    },
    close: () => browser.deleteSession()
  };

  const ok = await runFlow(driver, out, { slow: 2, online: true });
  await driver.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
