import type { PinNumber } from "../types/bowling";
import { PIN_POSITIONS } from "./pinGeometry";

export const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * A leave is a split when the head pin (1) is down and two standing pins are
 * separated by a gap. Using the physical pin layout (lateral board + depth in
 * feet): a split exists when some knocked-down pin lies laterally *between* two
 * standing pins and is not strictly behind both of them — i.e. either directly
 * between them in the same row (e.g. 4-6, 7-10) or immediately ahead and between
 * them (e.g. the 6 ahead of 9-10), which matches the USBC definition.
 *
 * Two pins stacked in the same lateral line (a "sleeper" such as 2-8) share a
 * board and so have nothing between them — correctly not a split. Adjacency
 * alone does not make a non-split: 9-10 is a split because the 6 is down.
 */
export function isSplit(standing: PinNumber[]): boolean {
  if (standing.includes(1)) return false;
  if (standing.length < 2) return false;
  const down = ALL_PINS.filter((p) => !standing.includes(p));
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = PIN_POSITIONS[standing[i]];
      const b = PIN_POSITIONS[standing[j]];
      const lo = Math.min(a.board, b.board);
      const hi = Math.max(a.board, b.board);
      if (lo === hi) continue; // stacked in the same line (sleeper) — no gap
      const backFeet = Math.max(a.feet, b.feet);
      for (const d of down) {
        const p = PIN_POSITIONS[d];
        // A down pin laterally between the pair and not strictly behind both
        // opens a gap between them → split.
        if (p.board > lo && p.board < hi && p.feet <= backFeet) return true;
      }
    }
  }
  return false;
}

export function uniquePins(pins: PinNumber[]): PinNumber[] {
  return [...new Set(pins)].sort((a, b) => a - b);
}

export function knockedDownCount(pinsStanding: PinNumber[] = ALL_PINS): number {
  return 10 - uniquePins(pinsStanding).length;
}

/**
 * Pins cleared between two shots (count of pins standing before but not after).
 * If `previousStandingPins` is empty (prior shot was a strike / fresh rack),
 * the lane is treated as a full rack — i.e. count what was knocked down this shot.
 */
export function pinsClearedBetween(
  previousStandingPins: PinNumber[],
  currentStandingPins: PinNumber[]
): number {
  const previous = previousStandingPins.length === 0 ? ALL_PINS : previousStandingPins;
  const current = new Set(uniquePins(currentStandingPins));

  return uniquePins(previous).filter((pin) => !current.has(pin)).length;
}
