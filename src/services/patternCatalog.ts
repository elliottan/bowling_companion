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

/**
 * Seed the catalog into the bowler's own pattern list (ADR-105).
 *
 * The catalog and the patterns you can pick for a session used to be two
 * lists, which meant a pattern had to be "added" before it could be used, and
 * a bowler had to know the difference. There is no difference worth knowing.
 * So every catalog pattern becomes a row like any other, and nothing
 * downstream, the session form, the visualizer, the settings list, has to care
 * where a pattern came from.
 *
 * Rows are matched by `catalog_id`, never by name, so a bowler who renamed one
 * keeps their name and still gets the load table updated when the catalog
 * improves. A name they already used for a pattern of their own is left alone:
 * theirs is theirs, and the link is offered in the editor instead.
 */
export async function syncPatternCatalog(): Promise<void> {
  const [catalog, { db }] = await Promise.all([
    getCatalogPatterns(),
    import("../db/bowlingDb"),
  ]);
  if (catalog.length === 0) return;

  const mine = await db.oil_patterns.toArray();
  const byCatalogId = new Map(mine.filter((p) => p.catalog_id).map((p) => [p.catalog_id!, p]));
  const usedNames = new Set(mine.map((p) => p.name.trim().toLowerCase()));

  for (const pattern of catalog) {
    const existing = byCatalogId.get(pattern.id);
    if (existing?.id != null) {
      // The catalog is the source of truth for everything except the name.
      await db.oil_patterns.update(existing.id, {
        passes: pattern.passes,
        url: existing.url ?? pattern.sourceUrl,
      });
      continue;
    }
    if (usedNames.has(pattern.name.trim().toLowerCase())) continue;
    await db.oil_patterns.add({
      name: pattern.name,
      url: pattern.sourceUrl,
      passes: pattern.passes,
      catalog_id: pattern.id,
    });
    usedNames.add(pattern.name.trim().toLowerCase());
  }
}
