/**
 * The app's place in the App Store. Kept apart from `pro.ts` because the build
 * reads it too (the Smart App Banner, `vite.config.ts`), and it carries
 * nothing that needs a browser.
 */

/**
 * The app's App Store page. Null until the app is listed, and null keeps every
 * feature open on the web except at /app, which previews the locked app
 * (`LOCK_FREE_WEB` below): locking what nobody can buy yet would otherwise only
 * take it away. Set it in the same release the iOS app goes live, with a minor version
 * bump, since that is when a web bowler first sees a locked card. The iOS app
 * sells Pro itself and does not wait on it (ADR-158).
 */
export const APP_STORE_URL: string | null = null;

/**
 * Whether the free web app at /app shows Pro locked before the app is listed.
 * With it on, /app is a working preview of the free tier (cards locked, the Pro
 * page, the Home banner), so changes to it can be seen on the web before an iOS
 * rebuild, and the Pro page says the app is not in the store yet. The owner's
 * copy at /score is never locked, and neither is the Android app. Turn it off to
 * leave /app fully open until the app is listed (ADR-166).
 */
export const LOCK_FREE_WEB = true;

/**
 * The app's numeric App Store id, read from its App Store URL
 * (`apps.apple.com/.../id1234567890`). Safari's Smart App Banner names the app
 * by it: once the app is listed, a page of the site opened in Safari offers to
 * open the app, or get it (ADR-159).
 */
export function appStoreId(url: string | null = APP_STORE_URL): string | null {
  return url?.match(/\/id(\d+)/)?.[1] ?? null;
}
