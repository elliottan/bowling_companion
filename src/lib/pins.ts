import type { PinNumber } from "../types/bowling";

export const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
