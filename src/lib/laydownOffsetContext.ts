import { createContext, useContext } from "react";

/** Default boards between the stance (slide foot) and where the ball touches
 *  down. Hand-relative board numbers mirror per hand, so `stance − offset`
 *  works unchanged for both hands (ADR-028). */
export const DEFAULT_LAYDOWN_OFFSET = 6;

export const LaydownOffsetContext = createContext<number>(DEFAULT_LAYDOWN_OFFSET);
export const useLaydownOffset = (): number => useContext(LaydownOffsetContext);

/** Derived laydown board for a stance, snapped to half-boards on the lane. */
export function deriveLaydown(stance: number, offset: number): number {
  return Math.max(1, Math.min(39, Math.round((stance - offset) * 2) / 2));
}
