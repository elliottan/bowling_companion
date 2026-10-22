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
 * rebuild, and the Pro page says the app is not in the store yet. The Android
 * app is never locked. Turn it off to
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

/**
 * The landing page as it reads once the app is in the App Store: every button
 * that opens the web app opens the App Store page instead, and what only makes
 * sense for the web app (adding it to the home screen) gives way to the App
 * Store's. The page carries both, marked, and the build picks; with no App
 * Store page yet it is left as it is, pointing at the web app.
 *
 * - `href="/app" data-store` is a link to the app, pointed at the App Store.
 * - `<span data-store-label="X">...</span>` is a button's words, X once listed;
 *   a `data-web-label` beside it keeps the web words for the page to put back
 *   where the App Store is not the way in (Android).
 * - `<!--store:web-->...<!--/store:web-->` is dropped once listed.
 * - `<!--store:app ...-->` is a comment until listed, then its content, with
 *   `{appStoreUrl}` filled in.
 */
export function pointLandingAtStore(html: string, url: string | null = APP_STORE_URL): string {
  if (!url) return html;
  return html
    .replace(/href="\/app" data-store/g, `href="${url}" data-store`)
    .replace(/<span data-store-label="([^"]*)"([^>]*)>[^<]*<\/span>/g, '<span data-store-label="$1"$2>$1</span>')
    .replace(/<!--store:web-->[\s\S]*?<!--\/store:web-->/g, "")
    .replace(/<!--store:app([\s\S]*?)-->/g, (_, inner: string) => inner.split("{appStoreUrl}").join(url));
}
