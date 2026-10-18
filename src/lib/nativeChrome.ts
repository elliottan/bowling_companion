import { isNativeApp } from "./platform";

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
