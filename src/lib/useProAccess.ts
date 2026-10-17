import { createContext, useContext } from "react";
import { webProAccess, type ProAccess } from "./pro";

/**
 * The app's answer to "is Pro open here", read by every locked card. The
 * default is the web's, so nothing has to provide it; the store apps will
 * provide their purchase state here, and tests provide a locked one.
 */
export const ProAccessContext = createContext<ProAccess>(webProAccess());

export function useProAccess(): ProAccess {
  return useContext(ProAccessContext);
}
