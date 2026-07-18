/**
 * Handles the native "Add to Home Screen" install flow. Android/Chrome fire
 * `beforeinstallprompt`, which we capture (side effect, registered from
 * main.tsx) and replay later via promptInstall(). iOS Safari has no such
 * event/API — isIOSSafari() lets the UI fall back to static instructions.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// iOS Safari's legacy standalone-display flag; not in the standard DOM lib.
interface NavigatorWithStandalone {
  standalone?: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Register the beforeinstallprompt listener. Call once from main.tsx. */
export function initInstallPrompt(win: Window = window): void {
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const event = deferredPrompt;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

type NavUAInfo = Pick<Navigator, "userAgent" | "maxTouchPoints">;

/** iPhone/iPod always identify themselves; iPadOS spoofs a desktop Mac UA but
 * (unlike a real Mac) reports touch points, so that combination also counts. */
export function isIOSSafari(nav: NavUAInfo = navigator): boolean {
  const ua = nav.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
}

type WinDisplayModeInfo = Pick<Window, "matchMedia">;

export function isStandalone(
  win: WinDisplayModeInfo = window,
  nav: NavigatorWithStandalone = navigator as Navigator & NavigatorWithStandalone
): boolean {
  return win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}
