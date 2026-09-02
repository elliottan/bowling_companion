import type { Handedness, PinNumber } from "../types/bowling";
import { PIN_POSITIONS } from "./pinGeometry";

export const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * A leave is a split when the head pin (1) is down and two standing pins are
 * separated by a gap. Using the physical pin layout (lateral board + depth in
 * feet): a split exists when some knocked-down pin lies laterally *between* two
 * standing pins and is not strictly behind both of them, i.e. either directly
 * between them in the same row (e.g. 4-6, 7-10) or immediately ahead and between
 * them (e.g. the 6 ahead of 9-10), which matches the USBC definition.
 *
 * Two pins stacked in the same lateral line (a "sleeper" such as 2-8) share a
 * board and so have nothing between them, correctly not a split. Adjacency
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
      if (lo === hi) continue; // stacked in the same line (sleeper), no gap
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

/** Lateral board span of one pin spacing (~11.25). Gaps at/under this mean the
 *  standing pins are adjacent; a real (wide) split has a larger gap. */
const ONE_PIN_GAP = 12;

/**
 * A "baby split": a split (red circle) that is makeable because all standing
 * pins are laterally adjacent, no consecutive board gap exceeds one pin width.
 * Examples (baby): 2-7, 3-10, 4-5, 5-6, 7-8, 9-10, 3-9-10.
 * Examples (NOT baby / real splits): 4-6, 5-7, 7-9, 7-10, 8-10, big-four.
 */
export function isBabySplit(standing: PinNumber[]): boolean {
  if (!isSplit(standing)) return false;
  const boards = standing
    .map((p) => PIN_POSITIONS[p].board)
    .sort((a, b) => a - b);
  for (let i = 1; i < boards.length; i++) {
    if (boards[i] - boards[i - 1] > ONE_PIN_GAP) return false;
  }
  return true;
}

/**
 * A washout: the head pin is standing along with pins that would form a split
 * if it weren't (e.g. 1-2-10, 1-3-7, 1-2-4-10). By the USBC definition these
 * are not splits, the head pin is up, but they don't convert like an
 * ordinary leave either, so they're tracked as their own group.
 */
export function isWashout(standing: PinNumber[]): boolean {
  if (!standing.includes(1)) return false;
  return isSplit(standing.filter((p) => p !== 1));
}

/** Screen-reader description of a pin diagram. The numerals rendered inside
 *  each pin are decorative, position and fill already carry the meaning, so
 *  the diagram is exposed as a single labeled image using this text. */
export function describePinsStanding(standing: PinNumber[]): string {
  if (standing.length === 0) return "No pins standing";
  if (standing.length === 10) return "All ten pins standing";
  if (standing.length === 1) return `${standing[0]} pin standing`;
  return `Pins standing: ${standing.join(", ")}`;
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
 * the lane is treated as a full rack, i.e. count what was knocked down this shot.
 */
export function pinsClearedBetween(
  previousStandingPins: PinNumber[],
  currentStandingPins: PinNumber[]
): number {
  const previous = previousStandingPins.length === 0 ? ALL_PINS : previousStandingPins;
  const current = new Set(uniquePins(currentStandingPins));

  return uniquePins(previous).filter((pin) => !current.has(pin)).length;
}

/** Mirror of the rack: what a lefty's leave looks like to a right-hander.
 *  Self-inverse, so the same map converts either way. */
const MIRRORED: Record<PinNumber, PinNumber> = {
  1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7
};

/**
 * Whether a first ball found the pocket, inferred from what it left standing
 * (ADR-046). The rule is stated for a right-hander and a left-hander's leave is
 * mirrored into that frame first, so there is one table, not two.
 *
 * The pocket is the 1-3 (RH), so a leave with the 1 or the 3 standing never
 * qualifies. Past that the default is yes, the ball got there, minus the
 * shapes that say otherwise: 4-6 together means it went through the nose (big
 * four, Greek church), 4-9 is high and flat, 2-10 is light, the 2-4-5 bucket
 * family is light, and a lone 5 means nothing drove through.
 *
 * A guess, not a measurement: a crossover strike reads as a pocket hit here
 * because the rack is empty either way. The bowler overrides it on the shot.
 */
export function isPocketHit(standing: PinNumber[], handedness: Handedness): boolean {
  const leave = new Set(
    handedness === "left" ? standing.map((p) => MIRRORED[p]) : standing
  );
  if (leave.size === 0) return true;              // strike
  if (leave.has(1) || leave.has(3)) return false; // pocket pins still up
  if (leave.has(4) && leave.has(6)) return false; // through the nose
  if (leave.has(4) && leave.has(9)) return false; // high and flat
  if (leave.has(2) && leave.has(10)) return false; // light
  if (leave.has(2) && leave.has(4) && leave.has(5)) return false; // bucket family
  if (leave.size === 1 && leave.has(5)) return false; // lone 5, no drive
  return true;
}

/** The stored verdict when the bowler set one, the inference otherwise. Shots
 *  recorded before the toggle existed (and imported ones) carry no verdict, so
 *  they fall back to the rule and follow it as the rule changes. */
export function resolvePocketHit(
  shot: { pins_standing: PinNumber[]; pocket_hit?: boolean },
  handedness: Handedness
): boolean {
  return shot.pocket_hit ?? isPocketHit(shot.pins_standing, handedness);
}
