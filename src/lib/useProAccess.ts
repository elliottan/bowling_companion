import { createContext, useContext } from "react";
import { webProAccess, type ProAccess, type ProStore } from "./pro";

/**
 * The app's answer to "is Pro open here", read by every locked card. The
 * default is the web's, so nothing has to provide it; the iOS app provides its
 * purchase state here (`App`, `useProStore`), and tests provide a locked one.
 */
export const ProAccessContext = createContext<ProAccess>(webProAccess());

export function useProAccess(): ProAccess {
  return useContext(ProAccessContext);
}

/**
 * The store itself, where the app sells Pro, for what needs it whether Pro is
 * owned or not: Settings shows it bought, and offers Restore purchases.
 */
export const ProStoreContext = createContext<ProStore | null>(null);

export function useProStoreContext(): ProStore | null {
  return useContext(ProStoreContext);
}

/** Whether this copy has Headpin Pro because it was bought, as opposed to Pro
 *  being open for some other reason (ADR-164). */
export function useProOwned(): boolean {
  const access = useProAccess();
  return !access.locked && access.owned === true;
}
