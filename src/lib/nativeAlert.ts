import { unthenable } from "./nativePlugin";
import { accentHex } from "./nativeTabBar";

/**
 * A confirm asked by UIKit in the iPhone app (ADR-231,
 * `ios/App/App/HeadpinAlertPlugin.swift`). `ConfirmDialog` is the only caller.
 */

export interface AlertPlugin {
  confirm(options: {
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive: boolean;
    dark: boolean;
    accent: string;
  }): Promise<{ confirmed: boolean }>;
}

export interface NativeConfirm {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

/** `confirm` or `cancel` from the phone; `unavailable` where the app was built
 *  without the plugin or it failed, and the page draws its own dialog. */
export type NativeAnswer = "confirm" | "cancel" | "unavailable";

let alertPlugin: Promise<AlertPlugin> | null = null;

function loadAlertPlugin(): Promise<AlertPlugin> {
  alertPlugin ??= import("@capacitor/core").then(({ registerPlugin }) =>
    unthenable(registerPlugin<AlertPlugin>("HeadpinAlert"))
  );
  return alertPlugin;
}

// Once the plugin has failed it is missing from this build, so the page
// draws every later confirm itself rather than failing at each one.
let missing = false;

// The one alert on screen. A second ask while it is up (React's development
// remount runs an effect twice) waits on the same answer rather than stacking
// a second alert.
let inFlight: { key: string; answer: Promise<NativeAnswer> } | null = null;

export function nativeAlertMissing(): boolean {
  return missing;
}

export function askNativeConfirm(
  ask: NativeConfirm,
  plugin: () => Promise<AlertPlugin> = loadAlertPlugin
): Promise<NativeAnswer> {
  if (missing) return Promise.resolve("unavailable");
  const key = JSON.stringify(ask);
  if (inFlight?.key === key) return inFlight.answer;
  const answer = plugin()
    .then((p) =>
      p.confirm({
        ...ask,
        dark: document.documentElement.dataset.theme === "dark",
        accent: accentHex()
      })
    )
    .then(({ confirmed }): NativeAnswer => (confirmed ? "confirm" : "cancel"))
    .catch((): NativeAnswer => {
      missing = true;
      return "unavailable";
    })
    .finally(() => {
      if (inFlight?.answer === answer) inFlight = null;
    });
  inFlight = { key, answer };
  return answer;
}

/** For tests: forget a failure and any alert in flight. */
export function resetNativeAlert(): void {
  missing = false;
  inFlight = null;
  alertPlugin = null;
}
