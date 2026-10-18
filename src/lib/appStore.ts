/**
 * The app's place in the App Store. Kept apart from `pro.ts` because the build
 * reads it too (the Smart App Banner, `vite.config.ts`), and it carries
 * nothing that needs a browser.
 */

/**
 * The app's App Store page. Null until the app is listed, and null keeps every
 * feature open on the web: locking what nobody can buy yet would only take it
 * away. Set it in the same release the iOS app goes live, with a minor version
 * bump, since that is when a web bowler first sees a locked card. The iOS app
 * sells Pro itself and does not wait on it (ADR-158).
 */
export const APP_STORE_URL: string | null = null;

/**
 * The app's numeric App Store id, read from its App Store URL
 * (`apps.apple.com/.../id1234567890`). Safari's Smart App Banner names the app
 * by it: once the app is listed, a page of the site opened in Safari offers to
 * open the app, or get it (ADR-159).
 */
export function appStoreId(url: string | null = APP_STORE_URL): string | null {
  return url?.match(/\/id(\d+)/)?.[1] ?? null;
}
