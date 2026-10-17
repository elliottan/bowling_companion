/**
 * Whether the Pro parts of the app are open, and where a bowler gets them
 * (ADR-154). Pro is one purchase inside the store apps; the web app never sells
 * it, so on the web a Pro card points at the App Store instead.
 */

/**
 * The app's App Store page. Null until the app is listed, and null keeps every
 * feature open: locking what nobody can buy yet would only take it away. Set it
 * in the same release the iOS app goes live, with a minor version bump, since
 * that is when a bowler first sees a locked card.
 */
export const APP_STORE_URL: string | null = null;

/**
 * The free web app, where the landing page, guides and shared links send a
 * bowler. It is the same shell as the owner's copy; only the address differs.
 */
export const FREE_APP_PATH = "/app";

/**
 * The owner's copy, at the app's original address: every feature, always, by
 * the owner's decision (ADR-154). It is not a secret, since anyone who types it
 * gets it, and it is linked from nowhere.
 */
export const OWNER_APP_PATH = "/score";

export type ProAccess = { locked: false } | { locked: true; appStoreUrl: string };

export const PRO_OPEN: ProAccess = { locked: false };

/** Whether a page path is the owner's copy: `/score`, or its directory form. */
export function isOwnerPath(pathname: string): boolean {
  return pathname === OWNER_APP_PATH || pathname.startsWith(`${OWNER_APP_PATH}/`);
}

/** What the web app offers: everything at the owner's address, and elsewhere
 *  everything until there is an app to send a bowler to, then the free
 *  features with the rest pointing at it. */
export function webProAccess(
  appStoreUrl: string | null = APP_STORE_URL,
  pathname: string = typeof window === "undefined" ? FREE_APP_PATH : window.location.pathname
): ProAccess {
  if (isOwnerPath(pathname)) return PRO_OPEN;
  return appStoreUrl ? { locked: true, appStoreUrl } : PRO_OPEN;
}

/** Hands the App Store link to the platform, which opens the App Store app on
 *  an iPhone. Assigned to `location`, as `openMail` does, because a new tab from
 *  an installed web app is a blank browser sheet. */
export function openAppStore(url: string): void {
  window.location.href = url;
}
