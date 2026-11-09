import { DEFAULT_WEIGHT, type CatalogBall } from "../types/catalog";

/**
 * Comparing catalog balls (ADR-258, ADR-262): each at its own weight.
 */

/** The most balls a comparison holds (ADR-266): the table and the tray scroll
 *  sideways past what a phone shows at once. */
export const MAX_COMPARE = 8;

/** Every weight a ball is made in that the app offers, heaviest first. */
export const BALL_WEIGHTS: readonly number[] = [16, 15, 14, 13, 12, 11, 10, 9, 8];

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

/** The weights a ball lists specs for, heaviest first, with 15 lb always
 *  there since every ball's top-level numbers are 15 lb. */
export function weightsFor(ball: CatalogBall): number[] {
  const set = new Set<number>([DEFAULT_WEIGHT]);
  for (const w of ball.weights ?? []) set.add(w.weight);
  return [...set].sort((a, b) => b - a);
}

/** One ball in the comparison: a catalog ball at one weight. The same ball
 *  may be in twice, at two weights, never twice at one. */
export interface CompareEntry {
  id: string;
  weight: number;
}

/** A catalog ball at a weight, resolved: a compared entry, or a ball in the
 *  bowler's bag at the weight it was bought in. */
export interface WeighedBall {
  ball: CatalogBall;
  weight: number;
}

/** What tells two entries apart: the ball and its weight. */
export function entryKey(entry: { id: string; weight: number }): string {
  return `${entry.id}@${entry.weight}`;
}

/**
 * The weight a ball comes into the comparison at, or null when it has no
 * weight left to come in at. A ball the bowler owns comes in at a weight they
 * own it in, so it is their ball and not one like it; past those, and for any
 * other ball, the bowler's default weight, then the weights nearest it.
 */
export function nextWeight(
  ball: CatalogBall,
  taken: readonly number[],
  preferred: number,
  ownedWeights: readonly number[] = []
): number | null {
  const near = [...BALL_WEIGHTS].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || b - a);
  const listed = weightsFor(ball);
  const candidates = [...ownedWeights, preferred, ...near.filter((w) => listed.includes(w)), ...near];
  return candidates.find((w) => !taken.includes(w)) ?? null;
}

/** One ball on the graph, numbered as the key under it numbers it. */
export interface GraphPoint extends WeighedBall {
  /** The ball and its weight, unique on the graph. */
  key: string;
  n: number;
  /** Picked to compare. */
  selected: boolean;
  owned: boolean;
}

/**
 * The balls on the graph, numbered: the compared first, in the order they were
 * picked, then the bowler's own when the bag is shown, each at its own weight.
 * A compared ball at a weight the bowler owns it in is one point, both
 * Selected and Owned. Shared by the chart and its key so the two always
 * number alike.
 */
export function graphPoints(
  compared: readonly WeighedBall[],
  owned: readonly WeighedBall[],
  showOwned: boolean
): GraphPoint[] {
  const key = (b: WeighedBall) => entryKey({ id: b.ball.id, weight: b.weight });
  const ownedKeys = new Set(owned.map(key));
  const seen = new Set<string>();
  const points: GraphPoint[] = [];
  const add = (b: WeighedBall, selected: boolean) => {
    const k = key(b);
    if (seen.has(k)) return;
    seen.add(k);
    points.push({ ...b, key: k, n: points.length + 1, selected, owned: ownedKeys.has(k) });
  };
  for (const b of compared) add(b, true);
  if (showOwned) for (const b of owned) add(b, false);
  return points;
}
