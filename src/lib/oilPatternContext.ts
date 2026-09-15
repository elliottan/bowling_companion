import { createContext, useContext } from "react";
import type { OilPattern } from "../types/bowling";

/** The oil pattern the session is on, so the lane can draw it without every
 *  screen between the session and the visualizer carrying it as a prop. Null
 *  where there is no session, or the session names no pattern. */
export const OilPatternContext = createContext<OilPattern | null>(null);

export const useSessionOilPattern = (): OilPattern | null => useContext(OilPatternContext);
