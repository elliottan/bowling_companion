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
