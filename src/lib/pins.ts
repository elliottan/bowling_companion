import type { PinNumber } from "../types/bowling";

export const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const EDGES: [PinNumber, PinNumber][] = [
  [1, 2], [1, 3],
  [2, 3], [2, 4], [2, 5],
  [3, 5], [3, 6],
  [4, 5], [4, 7], [4, 8],
  [5, 6], [5, 8], [5, 9],
  [6, 9], [6, 10],
  [7, 8],
  [8, 9],
  [9, 10],
];

const NEIGHBORS: Record<PinNumber, PinNumber[]> = (() => {
  const map = {} as Record<PinNumber, PinNumber[]>;
  for (let i = 1; i <= 10; i++) map[i as PinNumber] = [];
  for (const [a, b] of EDGES) {
    map[a].push(b);
    map[b].push(a);
  }
  return map;
})();

export function isSplit(standing: PinNumber[]): boolean {
  if (standing.includes(1)) return false;
  if (standing.length < 2) return false;
  const standingSet = new Set(standing);
  const visited = new Set<PinNumber>();
  const queue: PinNumber[] = [standing[0]];
  visited.add(standing[0]);
  while (queue.length) {
    const pin = queue.shift()!;
    for (const neighbor of NEIGHBORS[pin]) {
      if (standingSet.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size < standingSet.size;
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
