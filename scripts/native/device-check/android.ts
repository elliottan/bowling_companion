/**
 * The device check on an Android emulator or phone (ADR-155).
 *
 *   npm run build:android && (cd android && ./gradlew assembleDebug)
 *   tsx scripts/native/device-check/android.ts [--slow 4] [--offline] [--out dir]
 *
 * Installs the debug APK on the device `adb` sees, launches it, and drives its
 * web view through Playwright's Android support, which a debug build of a
 * Capacitor app allows. Taps go through
 * `adb shell input`, so they are real touches through Android's input stack,
 * hit-tested by the web view the way a finger is.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { _android, type AndroidDevice, type Page } from "@playwright/test";
import type { Driver } from "./driver";
import { runFlow } from "./flow";

const PACKAGE = "app.headpin";
const APK = "android/app/build/outputs/apk/debug/app-debug.apk";

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

/**
 * The app's web view as a Playwright page, through Playwright's own Android
 * support: a general CDP connection to a web view's debug socket half works
 * and then cannot list its pages. A debug build exposes the socket.
 */
async function connect(): Promise<{ device: AndroidDevice; page: Page }> {
  const [device] = await _android.devices();
  if (!device) throw new Error("adb sees no device");
  try {
    const webview = await device.webView({ pkg: PACKAGE }, { timeout: 240_000 });
    return { device, page: await webview.page() };
  } catch (err) {
    await device.close().catch(() => {});
    throw new Error(`The app's web view never offered a debugging socket (${(err as Error).message.split("\n")[0]})`);
  }
}

/**
 * Where the web view sits on the screen, in device pixels, read from Android's
 * own layout. It is not always the whole screen: on a system web view older
 * than Chromium 140, Capacitor pads it clear of the system bars instead of
 * drawing edge to edge (SystemBars "native"), so a page's (0, 0) is below the
 * status bar.
 */
let webViewOrigin: { left: number; top: number } | null = null;
function webViewOnScreen(): { left: number; top: number } {
  if (webViewOrigin) return webViewOrigin;
  adb("shell", "uiautomator", "dump", "/sdcard/headpin-ui.xml");
  const xml = adb("shell", "cat", "/sdcard/headpin-ui.xml");
  const node = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);
  webViewOrigin = node ? { left: Number(node[1]), top: Number(node[2]) } : { left: 0, top: 0 };
  return webViewOrigin;
}

/** The page's CSS pixels to the screen's, for `input tap`. */
async function screenPoint(page: Page, x: number, y: number) {
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const { left, top } = webViewOnScreen();
  return { x: Math.round(left + x * dpr), y: Math.round(top + y * dpr) };
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
  let { device, page } = await connect().catch((err) => {
    // Say what was on the screen instead.
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "no-webview.png"), execFileSync(adbBin, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
    throw err;
  });

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
      await device.close().catch(() => {});
      adb("shell", "am", "force-stop", PACKAGE);
      launch();
      ({ device, page } = await connect());
      webViewOrigin = null;
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
      writeFileSync(path, png);
    },
    async close() {
      await device.close().catch(() => {});
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
