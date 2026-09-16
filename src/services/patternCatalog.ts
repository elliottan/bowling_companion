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
/**
 * A one-time reset of every catalog link (ADR-106).
 *
 * Linking was one way by design, which is right for a link made deliberately
 * and wrong for the first one made by mistake. Rather than add an unlink
 * button, which would undo the property the model rests on, every link is
 * cleared once so the bowler can make them again. The load tables are left
 * alone: a row keeps what it had, and adoption below re-links whatever is
 * unambiguous, so in practice only the mistake needs redoing.
 */
const RESET_KEY = "oil_pattern_links_reset";

async function resetLinksOnce(): Promise<void> {
  const { getSetting, setSetting } = await import("./bowlingRepository");
  if (await getSetting(RESET_KEY)) return;

  const { db } = await import("../db/bowlingDb");
  const linked = (await db.oil_patterns.toArray()).filter((p) => p.catalog_id != null);
  for (const pattern of linked) {
    if (pattern.id != null) await db.oil_patterns.update(pattern.id, { catalog_id: undefined });
  }
  await setSetting(RESET_KEY, new Date().toISOString());
}

/** Two rows are the same pattern when their load tables are, whatever they are
 *  called. This is what lets a renamed row be re-adopted rather than duplicated. */
function sameTable(a: OilPass[] | undefined, b: OilPass[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((pass, i) => JSON.stringify(pass) === JSON.stringify(b[i]));
}

/**
 * Collapse rows that are already the same catalog pattern twice (ADR-107).
 *
 * A link made before this shipped left a pair: the bowler's own row, now
 * carrying the catalog id, and the row the catalog had seeded beside it. The
 * survivor is the older of the two, which is the one their sessions were
 * written against, and the younger one's sessions are repointed at it anyway
 * before it goes. Linking collapses its own duplicates now, so this only ever
 * has work to do once per pair.
 */
async function healDuplicateLinks(): Promise<void> {
  const { db } = await import("../db/bowlingDb");
  const { collapseCatalogDuplicates } = await import("./ballRepository");

  const linked = (await db.oil_patterns.toArray()).filter((p) => p.catalog_id != null && p.id != null);
  const oldestByCatalogId = new Map<string, number>();
  for (const row of linked) {
    const seen = oldestByCatalogId.get(row.catalog_id!);
    if (seen == null || row.id! < seen) oldestByCatalogId.set(row.catalog_id!, row.id!);
  }
  for (const [catalogId, keepId] of oldestByCatalogId) {
    await db.transaction("rw", db.oil_patterns, db.sessions, () =>
      collapseCatalogDuplicates(keepId, catalogId)
    );
  }
}

export async function syncPatternCatalog(): Promise<void> {
  await resetLinksOnce();

  const [catalog, { db }] = await Promise.all([
    getCatalogPatterns(),
    import("../db/bowlingDb"),
  ]);
  if (catalog.length === 0) return;

  await healDuplicateLinks();

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
    // Adopt a row that is plainly this pattern already: one carrying exactly
    // its load table, whatever it has been renamed to, or one that still has
    // its name. Both are unambiguous, and adopting beats inserting a duplicate
    // beside a pattern the bowler is already using.
    const adoptable = mine.find(
      (row) =>
        row.catalog_id == null &&
        (sameTable(row.passes, pattern.passes) ||
          row.name.trim().toLowerCase() === pattern.name.trim().toLowerCase())
    );
    if (adoptable?.id != null) {
      await db.oil_patterns.update(adoptable.id, {
        catalog_id: pattern.id,
        passes: pattern.passes,
      });
      adoptable.catalog_id = pattern.id;
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
