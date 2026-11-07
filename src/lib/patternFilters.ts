import type { PatternClass } from "./oilPattern";

/** The pattern list's filters: any mix of play styles, and a length range in
 *  feet. `null` bounds mean the range is untouched. */
export interface PatternFilters {
  shapes: ReadonlySet<PatternClass>;
  minFeet: number | null;
  maxFeet: number | null;
}

export const NO_PATTERN_FILTERS: PatternFilters = { shapes: new Set(), minFeet: null, maxFeet: null };

/** How many kinds of filter are on, for the button's badge. The play styles
 *  count once however many are picked, the same rule the session filter keeps. */
export function patternFilterCount(f: PatternFilters): number {
  return (f.shapes.size > 0 ? 1 : 0) + (f.minFeet != null || f.maxFeet != null ? 1 : 0);
}

export function matchesPatternFilters(
  feet: number | null,
  plays: PatternClass | null,
  f: PatternFilters,
): boolean {
  if (f.shapes.size > 0 && (plays == null || !f.shapes.has(plays))) return false;
  if (f.minFeet != null || f.maxFeet != null) {
    if (feet == null) return false;
    const whole = Math.round(feet);
    if (f.minFeet != null && whole < f.minFeet) return false;
    if (f.maxFeet != null && whole > f.maxFeet) return false;
  }
  return true;
}

/**
 * The bowler's patterns, the ones they have bowled most first.
 *
 * Every pattern with a game on it leads, in descending order of games, so
 * the house shot bowled every week is the first row rather than somewhere in
 * an alphabet of a whole catalog. The rest keep the order they came in (by
 * name), and so do ties, so the list does not shuffle between visits.
 */
export function byGamesBowled<T extends { id?: number }>(
  patterns: readonly T[],
  games: ReadonlyMap<number, number>
): T[] {
  const count = (p: T) => (p.id != null ? games.get(p.id) ?? 0 : 0);
  return patterns
    .map((pattern, index) => ({ pattern, index, games: count(pattern) }))
    .sort((a, b) => b.games - a.games || a.index - b.index)
    .map((entry) => entry.pattern);
}
