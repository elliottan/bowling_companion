/**
 * The device check on an Android emulator or phone (ADR-155).
 *
 *   npm run build:android && (cd android && ./gradlew assembleDebug)
 *   tsx scripts/native/device-check/android.ts [--slow 4] [--offline] [--out dir]
 *
 * Installs the debug APK on the device `adb` sees, launches it, and drives its
 * web view over Chrome's debugging protocol: a debug build of a Capacitor app
 * exposes it, and `adb forward` brings it to a local port. Taps go through
 * `adb shell input`, so they are real touches through Android's input stack,
 * hit-tested by the web view the way a finger is.
 */
import { execFileSync } from "node:child_process";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Driver } from "./driver";
import { runFlow } from "./flow";

const PACKAGE = "app.headpin";
const APK = "android/app/build/outputs/apk/debug/app-debug.apk";
const PORT = 9333;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const adbBin = process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}/platform-tools/adb` : "adb";
function adb(...a: string[]): string {
  return execFileSync(adbBin, a, { encoding: "utf8", timeout: 600_000 });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(): Promise<{ browser: Browser; page: Page }> {
  for (let attempt = 0; attempt < 120; attempt++) {
    let pid = "";
    let sockets = "";
    try {
      // `pidof` fails until the app's process exists.
      pid = adb("shell", "pidof", PACKAGE).trim();
      sockets = adb("shell", "cat", "/proc/net/unix");
    } catch {
      await sleep(2000);
      continue;
    }
    const socket = sockets.match(new RegExp(`@(webview_devtools_remote_${pid})`))?.[1];
    if (pid && socket) {
      try {
        adb("forward", "--remove-all");
        adb("forward", `tcp:${PORT}`, `localabstract:${socket}`);
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
        const page = browser.contexts()[0]?.pages()[0];
        if (page) return { browser, page };
        await browser.close();
      } catch {
        // The web view is still coming up.
      }
    }
    await sleep(2000);
  }
  throw new Error("The app's web view never offered a debugging socket");
}

/** The page's CSS pixels to the screen's, for `input tap`. */
async function screenPoint(page: Page, x: number, y: number) {
  const { dpr, top, left } = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    // The web view's own offset on screen: zero when it is drawn edge to edge.
    top: window.screenTop || 0,
    left: window.screenLeft || 0
  }));
  return { x: Math.round((x + left) * dpr), y: Math.round((y + top) * dpr) };
}

async function main() {
  const out = value("out", "device-check-out/android");
  const slow = Number(value("slow", "1"));
  adb("wait-for-device");
  // Booted is not ready: the package manager answers some while after.
  for (let i = 0; ; i++) {
    try {
      if (adb("shell", "pm", "path", "android").includes("package:")) break;
    } catch {
      if (i > 300) throw new Error("The package manager never came up");
    }
    await sleep(2000);
  }
  if (!flag("no-install")) {
    // A fresh install, so the first run is the first run. Uninstalling an app
    // that is not there fails, which is fine.
    try {
      adb("uninstall", PACKAGE);
    } catch {
      // Not installed.
    }
    adb("install", "-r", APK);
  }

  const launch = () => adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1");
  launch();
  let { browser, page } = await connect();

  const driver: Driver = {
    platform: "android",
    evaluate: (expression) => page.evaluate(expression),
    async tapAt(x, y) {
      const p = await screenPoint(page, x, y);
      adb("shell", "input", "tap", String(p.x), String(p.y));
    },
    async type(text) {
      // `input text` treats a space as an argument break.
      adb("shell", "input", "text", text.replace(/ /g, "%s"));
    },
    async systemBack() {
      adb("shell", "input", "keyevent", "KEYCODE_BACK");
      await sleep(500 * slow);
    },
    async dismissSystemSheet() {
      adb("shell", "input", "keyevent", "KEYCODE_BACK");
    },
    async appInForeground() {
      const focus = adb("shell", "dumpsys", "window").match(/mCurrentFocus=.*/)?.[0] ?? "";
      return focus.includes(PACKAGE);
    },
    async relaunch() {
      await browser.close().catch(() => {});
      adb("shell", "am", "force-stop", PACKAGE);
      launch();
      ({ browser, page } = await connect());
    },
    async setOnline(online) {
      const state = online ? "enable" : "disable";
      try {
        adb("shell", "svc", "wifi", state);
        adb("shell", "svc", "data", state);
        return true;
      } catch {
        return false;
      }
    },
    async screenshot(path) {
      const png = execFileSync(adbBin, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
      (await import("node:fs")).writeFileSync(path, png);
    },
    async close() {
      await browser.close().catch(() => {});
    }
  };

  const ok = await runFlow(driver, out, { slow, online: !flag("offline") });
  await driver.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
