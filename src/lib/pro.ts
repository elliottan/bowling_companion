/**
 * Whether the Pro parts of the app are open, and where a bowler gets them
 * (ADR-154). Pro is one purchase inside the store apps; the web app never sells
 * it, so on the web a Pro card points at the App Store instead.
 */

import { APP_STORE_URL, LOCK_FREE_WEB } from "./appStore";

export { APP_STORE_URL, appStoreId } from "./appStore";

/**
 * The web app, where the landing page, guides and shared links send a bowler.
 * There is one: the owner's copy that used to open at `/score` with every
 * feature is gone, and that address now redirects here (ADR-190).
 */
export const FREE_APP_PATH = "/app";

/** How a purchase the bowler started ended: bought, closed, or waiting on
 *  someone else (Ask to Buy, a payment still clearing). A store failure throws. */
export type PurchaseOutcome = "purchased" | "cancelled" | "pending";

/**
 * Pro as the iOS app sells it (ADR-158): whether this Apple ID owns it, what it
 * costs in the bowler's own currency (null until the App Store answers), and
 * the two things a bowler can do about it.
 */
export interface ProStore {
  owned: boolean;
  price: string | null;
  buy(): Promise<PurchaseOutcome>;
  /** Asks the App Store again; true when this Apple ID owns Pro. */
  restore(): Promise<boolean>;
}

/**
 * Whether Pro is open here, and when it is not, how to get it: the App Store
 * page from the web, or the purchase itself in the iOS app.
 */
export type ProAccess =
  /** `owned` is set where this copy is Pro as a buyer has it: an Apple ID that
   *  bought it. Not where Pro is merely open (a
   *  web with nothing to sell, the Android app), so a mark of ownership is never
   *  shown to a bowler who did not buy it (ADR-164). */
  | { locked: false; owned?: true }
  /** `appStoreUrl` is null on the free web before the app is listed (ADR-166):
   *  locked, with nowhere to send a bowler yet. */
  | { locked: true; appStoreUrl: string | null }
  | { locked: true; store: ProStore };

/** A locked answer, whichever way it is unlocked. */
export type LockedProAccess = Extract<ProAccess, { locked: true }>;

export const PRO_OPEN: ProAccess = { locked: false };

/** Pro as a buyer has it. */
export const PRO_OWNED: ProAccess = { locked: false, owned: true };

/** Whether a page path is the web app: `/app`, or its directory form. */
export function isFreeAppPath(pathname: string): boolean {
  return pathname === FREE_APP_PATH || pathname.startsWith(`${FREE_APP_PATH}/`);
}

/**
 * Pro open on the dev server when the page was opened with `?pro`, for the e2e
 * suite and the screenshot scripts, which drive every Pro screen. Read once, as
 * the page loads, so a screen that tidies its address keeps it. A build sets
 * `import.meta.env.DEV` to false and drops this, so no address opens Pro on
 * headpin.app (ADR-190).
 */
export function devProUnlock(
  dev: boolean = import.meta.env.DEV,
  search: string = typeof window === "undefined" ? "" : window.location.search
): boolean {
  return dev && new URLSearchParams(search).has("pro");
}

const DEV_PRO = devProUnlock();

/** What the web app offers: at /app the free features with the rest pointing
 *  at the App Store, or, before the app is listed, locked with nowhere to go
 *  yet (`LOCK_FREE_WEB`, ADR-166); anywhere else (the Android app) everything
 *  stays open. */
export function webProAccess(
  appStoreUrl: string | null = APP_STORE_URL,
  pathname: string = typeof window === "undefined" ? FREE_APP_PATH : window.location.pathname,
  lockFreeWeb: boolean = LOCK_FREE_WEB,
  unlocked: boolean = DEV_PRO
): ProAccess {
  if (unlocked) return PRO_OWNED;
  if (appStoreUrl) return { locked: true, appStoreUrl };
  return lockFreeWeb && isFreeAppPath(pathname) ? { locked: true, appStoreUrl: null } : PRO_OPEN;
}

/** What the app offers: the purchase where it sells Pro (the iOS app), and
 *  the web's answer anywhere else, which keeps everything open until Pro can
 *  be bought there (the Android app, until Play Billing). */
export function appProAccess(store: ProStore | null): ProAccess {
  if (!store) return webProAccess();
  return store.owned ? PRO_OWNED : { locked: true, store };
}

/** Hands the App Store link to the platform, which opens the App Store app on
 *  an iPhone. Assigned to `location`, as `openMail` does, because a new tab from
 *  an installed web app is a blank browser sheet. */
export function openAppStore(url: string): void {
  window.location.href = url;
}
