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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
      "appium:simulatorStartupTimeout": 600_000,
      "appium:webviewConnectTimeout": 120_000,
      // The simulator's Web Inspector names the app by its process ("App")
      // rather than its bundle id, and Appium hides a web view whose bundle
      // it does not recognise.
      "appium:additionalWebviewBundleIds": ["process-App"]
    }
  });

  // Appium's async script timeout starts at 0 ms, so a check that awaits
  // anything (a database count) would fail before its promise settles.
  await browser.setTimeout({ script: 120_000 });

  let webview: string | null = null;
  async function toWebview() {
    const deadline = Date.now() + 180_000;
    let seen: unknown[] = [];
    while (Date.now() < deadline) {
      const contexts = (await browser.getContexts()) as (string | { id: string })[];
      seen = contexts;
      const id = contexts.map((c) => (typeof c === "string" ? c : c.id)).find((c) => c.startsWith("WEBVIEW"));
      if (id) {
        webview = id;
        await browser.switchContext(id);
        return;
      }
      await sleep(3000);
    }
    // Say what the screen shows instead, so a failed run can be read: an app
    // that never launched, one that crashed, or one that is up but whose web
    // view will not be inspected.
    mkdirSync(out, { recursive: true });
    await browser.switchContext("NATIVE_APP").catch(() => {});
    await browser.saveScreenshot(join(out, "no-webview.png")).catch(() => {});
    writeFileSync(join(out, "no-webview-source.xml"), await browser.getPageSource().catch((e) => String(e)));
    const state = await browser.execute("mobile: queryAppState", { bundleId: BUNDLE }).catch((e) => String(e));
    throw new Error(`The app's web view never became inspectable (app state ${String(state)}, contexts ${JSON.stringify(seen)})`);
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
    // Typed by XCUITest into the native field under the page's focused input,
    // as the keyboard would: a raw key sequence is refused by WebDriverAgent
    // ("Key Down ... must have a closing Key Up"), and a web view's fields do
    // not answer the hasKeyboardFocus predicate.
    async type(text) {
      const r = await driver.evaluate<{ x: number; y: number } | null>(
        `(() => { const el = document.activeElement; if (!el || el === document.body) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`
      );
      if (!r) throw new Error("nothing on the page has focus to type into");
      await native(async () => {
        const fields = await browser.$$(
          "-ios predicate string:type IN {'XCUIElementTypeTextField','XCUIElementTypeSearchField','XCUIElementTypeTextView','XCUIElementTypeSecureTextField'}"
        );
        for (const field of fields) {
          const b = await browser.getElementRect(field.elementId);
          if (r.x >= b.x && r.x <= b.x + b.width && r.y >= b.y && r.y <= b.y + b.height) {
            await field.addValue(text);
            return;
          }
        }
        throw new Error(`no native text field under the focused input at ${Math.round(r.x)},${Math.round(r.y)} (${fields.length} fields)`);
      });
    },
    // The left-edge swipe, tried in the forms a finger makes until the page's
    // history moves, and logged by which one did: a synthesized touch that
    // starts too close to the edge, or moves at once, is not always taken for
    // the edge gesture. Nothing moving at all is a finding in its own right.
    async systemBack() {
      const { width, height } = await native(() => browser.getWindowSize());
      const where = () =>
        driver.evaluate<string>(`JSON.stringify([location.hash, history.state, history.length])`).catch(() => "gone");
      const before = await where();
      const forms: [string, () => Promise<unknown>][] = [
        [
          "drag from the edge",
          () => browser.execute("mobile: dragFromToForDuration", { duration: 0.1, fromX: 2, fromY: height / 2, toX: width * 0.8, toY: height / 2 })
        ],
        [
          "touch, hold, then pull",
          () =>
            touch([
              { x: 3, y: height / 2, ms: 0 },
              { x: 4, y: height / 2, ms: 120 },
              { x: width * 0.2, y: height / 2, ms: 120 },
              { x: width * 0.8, y: height / 2, ms: 300 }
            ])
        ],
        [
          "quick flick",
          () =>
            touch([
              { x: 1, y: height / 2, ms: 0 },
              { x: width * 0.7, y: height / 2, ms: 350 }
            ])
        ]
      ];
      for (const [name, swipe] of forms) {
        await native(swipe);
        await sleep(1000);
        if (!(await driver.appInForeground()) || (await where()) !== before) {
          console.log(`  edge swipe: "${name}" moved back`);
          return;
        }
      }
      console.log(`  edge swipe: no form moved the page's history (${before})`);
    },
    // The share sheet closes on a tap on the dimmed app above it.
    async dismissSystemSheet() {
      const { width } = await native(() => browser.getWindowSize());
      await native(() => touch([{ x: width / 2, y: 80, ms: 0 }]));
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
