import { DEFAULT_WEIGHT, type CatalogBall } from "../types/catalog";

/**
 * Comparing catalog balls (ADR-258): their specs at one weight.
 */

/** The most balls a comparison holds: four columns is what a phone fits. */
export const MAX_COMPARE = 4;

export interface SpecsAt {
  rg: number | null;
  diff: number | null;
  mbDiff: number | null;
  /** The weight these specs are for; the ball's own 15 lb numbers when it has
   *  none for the weight asked. */
  weight: number;
  /** False when the ball lists no specs at the weight asked, so the numbers
   *  are its 15 lb ones standing in. */
  exact: boolean;
}

/** A ball's RG, diff and MB diff at `weight`, from its per-weight specs. */
export function specsAt(ball: CatalogBall, weight: number): SpecsAt {
  const at = ball.weights?.find((w) => w.weight === weight);
  if (at) return { rg: at.rg, diff: at.diff, mbDiff: at.mbDiff, weight, exact: true };
  return { rg: ball.rg, diff: ball.diff, mbDiff: ball.mbDiff, weight: DEFAULT_WEIGHT, exact: weight === DEFAULT_WEIGHT };
}

/** Every weight any of the balls lists specs for, heaviest first, with 15 lb
 *  always there since every ball's top-level numbers are 15 lb. */
export function weightsOf(balls: readonly CatalogBall[]): number[] {
  const set = new Set<number>([DEFAULT_WEIGHT]);
  for (const b of balls) for (const w of b.weights ?? []) set.add(w.weight);
  return [...set].sort((a, b) => b - a);
}

/** One ball on the map, numbered as the key under it numbers it. */
export interface MapPoint {
  ball: CatalogBall;
  n: number;
  /** Picked to compare. */
  selected: boolean;
  owned: boolean;
}

/**
 * The balls on the map, numbered: the compared first, in the order they were
 * picked, then the bowler's own when the bag is shown. Shared by the chart and
 * its key so the two always number alike.
 */
export function mapPoints(
  compared: readonly CatalogBall[],
  owned: readonly CatalogBall[],
  showOwned: boolean
): MapPoint[] {
  const ownedIds = new Set(owned.map((b) => b.id));
  const comparedIds = new Set(compared.map((b) => b.id));
  const balls = [...compared, ...(showOwned ? owned.filter((b) => !comparedIds.has(b.id)) : [])];
  return balls.map((ball, i) => ({ ball, n: i + 1, selected: comparedIds.has(ball.id), owned: ownedIds.has(ball.id) }));
}
