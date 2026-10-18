/**
 * Which copy of the app is running: the web app, or the store app, which is
 * the same build inside Capacitor (ADR-155).
 *
 * The store app's pages are served from inside the app, at
 * `capacitor://localhost`, and that origin has none of the site's photos or
 * pattern sheets, since they are kept out of the app (ADR-154). So anything that
 * reaches the site by a root-relative path asks headpin.app for it instead, and
 * a link meant for someone else carries headpin.app rather than an address that
 * only exists inside one phone.
 */

/** The site: where the store app fetches photos, sheets and catalog updates,
 *  and the address every link it shares points at. */
export const SITE_ORIGIN = "https://headpin.app";

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
}

/**
 * Whether this is the store app. Read from the global Capacitor's native side
 * injects before the page loads, rather than from `@capacitor/core`, so the web
 * app's bundle carries none of it to answer "no".
 */
export function isNativeApp(scope: object = globalThis): boolean {
  const bridge = (scope as { Capacitor?: CapacitorBridge }).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}

/**
 * A path on the site, as this copy should ask for it. The web app asks its own
 * origin, so a preview deploy reads its own files; the store app asks
 * headpin.app. A full URL, or a missing one, is returned as it is.
 */
export function siteUrl(path: string, native?: boolean): string;
export function siteUrl(path: string | null | undefined, native?: boolean): string | undefined;
export function siteUrl(path: string | null | undefined, native = isNativeApp()): string | undefined {
  if (!path) return undefined;
  return native && path.startsWith("/") && !path.startsWith("//") ? `${SITE_ORIGIN}${path}` : path;
}

/**
 * The origin a shared link carries. The page's own on the web, so a link
 * shared from a preview build opens that preview; headpin.app from the store
 * app, whose own origin opens nothing on anyone else's phone.
 */
export function shareOrigin(native = isNativeApp()): string {
  return native ? SITE_ORIGIN : window.location.origin;
}

/**
 * Where the catalogs are read from, in order of preference. The web app reads
 * its own site, and its service worker keeps the last copy for offline. The
 * store app reads headpin.app, and without a connection falls back to the
 * snapshot built into it (ADR-154), so a fresh install works offline.
 */
export function catalogOrigins(native = isNativeApp()): string[] {
  return native ? [SITE_ORIGIN, ""] : [""];
}
