import { isAndroidApp, isNativeApp } from "./platform";

/**
 * Pinch zoom, off in the store apps only (ADR-160). A page that zooms under
 * two fingers is the surest sign of a website in an app frame, and App Review
 * looks for that (guideline 4.2). The web app keeps zoom: it is for low-vision
 * readers and the axe check holds it to that (VIEWPORT-BUG.md). In the apps,
 * iOS and Android offer their own system zoom, as for any app.
 *
 * Text selection, the long-press callout and the tap flash are already off
 * everywhere (`index.css`).
 */
export function applyNativeChrome(doc: Document = document, native = isNativeApp()): boolean {
  if (!native) return false;
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport || /user-scalable/.test(viewport.content)) return false;
  viewport.content = `${viewport.content}, maximum-scale=1, user-scalable=no`;
  return true;
}

type BarStyle = "DARK" | "LIGHT";

/**
 * The Android app's status and navigation bar icons follow the app's theme,
 * which a bowler can set apart from the phone's (ADR-168). The app is drawn
 * edge to edge, so the bars sit on the page's own color, and a phone in light
 * mode drew dark icons on a dark page. `DARK` is Capacitor's name for a dark
 * background, so light icons. The iPhone app does the same natively: its
 * window takes the page's theme (`HeadpinViewController`), which carries the
 * keyboard and the system's sheets with it.
 *
 * Returns a stop, or null where there is nothing to follow.
 */
export function followThemeInSystemBars(
  doc: Document = document,
  android = isAndroidApp(),
  setStyle: (style: BarStyle) => Promise<void> = (style) =>
    import("@capacitor/core").then(({ SystemBars }) => SystemBars.setStyle({ style: style as never }))
): (() => void) | null {
  if (!android) return null;
  let last: BarStyle | null = null;
  const apply = () => {
    const style: BarStyle = doc.documentElement.dataset.theme === "dark" ? "DARK" : "LIGHT";
    if (style === last) return;
    last = style;
    void setStyle(style).catch(() => {});
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
