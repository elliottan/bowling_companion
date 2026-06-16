import { createContext, useContext } from "react";
import type { Handedness } from "../types/bowling";

/**
 * Active handedness for board-direction controls. Defaults to "right" until the
 * stored value loads; the first-run modal forces an explicit choice when unset.
 */
export const HandednessContext = createContext<Handedness>("right");

export const useHandedness = (): Handedness => useContext(HandednessContext);
