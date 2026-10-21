/**
 * Whether the Pro parts of the app are open, and where a bowler gets them
 * (ADR-154). Pro is one purchase inside the store apps; the web app never sells
 * it, so on the web a Pro card points at the App Store instead.
 */

import { APP_STORE_URL, LOCK_FREE_WEB } from "./appStore";

export { APP_STORE_URL, appStoreId } from "./appStore";

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
  /** `owned` is set when this Apple ID bought Pro, and not when Pro is merely
   *  open (the owner's copy, a web with nothing to sell), so a mark of
   *  ownership is never shown to a bowler who did not buy it (ADR-164). */
  | { locked: false; owned?: true }
  /** `appStoreUrl` is null on the free web before the app is listed (ADR-166):
   *  locked, with nowhere to send a bowler yet. */
  | { locked: true; appStoreUrl: string | null }
  | { locked: true; store: ProStore };

/** A locked answer, whichever way it is unlocked. */
export type LockedProAccess = Extract<ProAccess, { locked: true }>;

export const PRO_OPEN: ProAccess = { locked: false };

/** Whether a page path is the owner's copy: `/score`, or its directory form. */
export function isOwnerPath(pathname: string): boolean {
  return pathname === OWNER_APP_PATH || pathname.startsWith(`${OWNER_APP_PATH}/`);
}

/** Whether a page path is the free web app: `/app`, or its directory form. */
export function isFreeAppPath(pathname: string): boolean {
  return pathname === FREE_APP_PATH || pathname.startsWith(`${FREE_APP_PATH}/`);
}

/** What the web app offers: everything at the owner's address; at /app the free
 *  features with the rest pointing at the App Store, or, before the app is
 *  listed, locked with nowhere to go yet (`LOCK_FREE_WEB`, ADR-166); anywhere
 *  else (the Android app, a stray address) everything stays open. */
export function webProAccess(
  appStoreUrl: string | null = APP_STORE_URL,
  pathname: string = typeof window === "undefined" ? FREE_APP_PATH : window.location.pathname,
  lockFreeWeb: boolean = LOCK_FREE_WEB
): ProAccess {
  if (isOwnerPath(pathname)) return PRO_OPEN;
  if (appStoreUrl) return { locked: true, appStoreUrl };
  return lockFreeWeb && isFreeAppPath(pathname) ? { locked: true, appStoreUrl: null } : PRO_OPEN;
}

/** What the app offers: the purchase where it sells Pro (the iOS app), and
 *  the web's answer anywhere else, which keeps everything open until Pro can
 *  be bought there (the Android app, until Play Billing). */
export function appProAccess(store: ProStore | null): ProAccess {
  if (!store) return webProAccess();
  return store.owned ? { locked: false, owned: true } : { locked: true, store };
}

/** Hands the App Store link to the platform, which opens the App Store app on
 *  an iPhone. Assigned to `location`, as `openMail` does, because a new tab from
 *  an installed web app is a blank browser sheet. */
export function openAppStore(url: string): void {
  window.location.href = url;
}
