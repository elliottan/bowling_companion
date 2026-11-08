import { DEFAULT_WEIGHT, type CatalogBall, type CoverstockCategory } from "../types/catalog";

/**
 * Comparing catalog balls (ADR-258): their specs at one weight, which value in
 * a row stands out, and which ball in the bowler's bag a ball sits closest to.
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

/**
 * Which cells in a row are marked: the lowest RG (the ball revs up soonest),
 * the highest diff and MB diff (most flare). Only when the row holds two or
 * more numbers and they are not all the same, since marking every cell, or
 * the only one, says nothing.
 */
export function marked(values: readonly (number | null)[], want: "low" | "high"): boolean[] {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return values.map(() => false);
  const best = want === "low" ? Math.min(...present) : Math.max(...present);
  if (present.every((v) => v === best)) return values.map(() => false);
  return values.map((v) => v === best);
}

/** How near two balls are to rolling alike, by RG and diff at one weight and
 *  the same kind of cover. Within these, two balls do much the same job. */
const NEAR_RG = 0.015;
const NEAR_DIFF = 0.004;

export interface Neighbour {
  ball: CatalogBall;
  /** The owned ball it sits close to. */
  owned: CatalogBall;
}

/**
 * For each compared ball that is not owned, the owned ball it sits closest
 * to, when that is close enough to do much the same job: the same cover type,
 * RG and diff within a hair. The nearest by RG and diff when there are several.
 */
export function closeToOwned(
  compared: readonly CatalogBall[],
  owned: readonly CatalogBall[],
  weight: number
): Neighbour[] {
  const out: Neighbour[] = [];
  const ownedIds = new Set(owned.map((b) => b.id));
  for (const ball of compared) {
    if (ownedIds.has(ball.id)) continue;
    const a = specsAt(ball, weight);
    if (a.rg == null || a.diff == null) continue;
    let best: { owned: CatalogBall; d: number } | null = null;
    for (const o of owned) {
      if (o.coverstockCategory !== ball.coverstockCategory) continue;
      const b = specsAt(o, weight);
      if (b.rg == null || b.diff == null) continue;
      const dRg = Math.abs(a.rg - b.rg);
      const dDiff = Math.abs(a.diff - b.diff);
      if (dRg > NEAR_RG || dDiff > NEAR_DIFF) continue;
      const d = dRg / NEAR_RG + dDiff / NEAR_DIFF;
      if (!best || d < best.d) best = { owned: o, d };
    }
    if (best) out.push({ ball, owned: best.owned });
  }
  return out;
}

/** The cover types in the order the map's legend lists them. */
export const COVER_ORDER: readonly CoverstockCategory[] = ["Solid", "Pearl", "Hybrid", "Urethane", "Polyester"];
