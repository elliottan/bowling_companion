import type { OilPass } from "../types/bowling";
import type { PatternClass } from "../lib/oilPattern";

/**
 * The shipped oil pattern catalog (ADR-104).
 *
 * Built by `scripts/sync-patterns`, where every pattern was checked against the
 * totals its own sheet prints before it was allowed in. Nothing here re-reads a
 * sheet: by the time a pattern is in this file it has been verified once, by a
 * pipeline, rather than on every bowler's phone.
 *
 * Fetched rather than bundled, and cached at runtime like the ball catalog, so
 * the patterns can grow without every app boot paying for them.
 */

export interface CatalogPattern {
  id: string;
  name: string;
  vendor: string;
  sourceUrl?: string;
  distance: number;
  volumeMl: number;
  ratio: number | null;
  /** Sport, challenge or recreation. Derived at ingest, shipped so a long list
   *  does not recompute it on every keystroke of a search. */
  shape: PatternClass | null;
  passes: OilPass[];
}

interface PatternCatalogFile {
  version: 1;
  generated_at: string;
  patterns: CatalogPattern[];
}

let cache: Promise<CatalogPattern[]> | null = null;

/** The catalog, read once per session. An unreachable catalog is an empty one:
 *  the pattern list still works, it just offers nothing to start from. */
export function getCatalogPatterns(): Promise<CatalogPattern[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}catalog/patterns.json`)
    .then((r) => (r.ok ? (r.json() as Promise<PatternCatalogFile>) : null))
    .then((file) => file?.patterns ?? [])
    .catch(() => []);
  return cache;
}

/** Test seam. */
export function resetPatternCatalogCache(): void {
  cache = null;
}
