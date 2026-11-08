import type { CatalogBall } from "../types/catalog";

/**
 * Which catalog balls share a core or a cover with another (ADR-251).
 *
 * The sources spell one name several ways ("Torsion A.I. Core" and "Torsion
 * AI", "HK22" and "HK-22"), so a name is compared by a key: lower case, the
 * word "core" dropped, and every space and mark of punctuation gone. The
 * catalog's filters match by the same key, so a ball's "View all" lands on
 * exactly the balls its row counted.
 */
export function kinKey(name: string | null | undefined): string | null {
  const key = words(name).join("");
  return key || null;
}

/** A name's words, lower case, with "core" left out. */
function words(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "" && word !== "core" && word !== "cores");
}

/**
 * Words that describe a kind of cover or core rather than name one. A name
 * made of nothing else ("Solid Reactive", "Polyester", "Pancake") is shared by
 * balls that have nothing in common but the kind, so it starts no row.
 */
const GENERIC_WORDS = new Set([
  "solid", "pearl", "pearlized", "hybrid", "reactive", "resin", "urethane",
  "polyester", "plastic", "clear", "ultra", "particle", "cover", "coverstock",
  "pancake", "symmetric", "symmetrical", "asymmetric", "asymmetrical",
  "traditional", "piece", "weight", "block", "light", "bulb",
  "2", "3", "two", "three"
]);

function isGeneric(name: string | null | undefined): boolean {
  return words(name).every((word) => GENERIC_WORDS.has(word));
}

/** The key a row of kin is found by, or null where the name names nothing in
 *  particular. */
export function rowKey(name: string | null | undefined): string | null {
  const key = kinKey(name);
  return key && !isGeneric(name) ? key : null;
}

/** Newest first, as the catalog opens, and by name within a release. */
function newestFirst(a: CatalogBall, b: CatalogBall): number {
  return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || a.name.localeCompare(b.name);
}

/** Every other ball on the same core, newest first. Empty where the ball has
 *  no core named, or one that names only a kind. */
export function sameCore(balls: readonly CatalogBall[], ball: CatalogBall): CatalogBall[] {
  const key = rowKey(ball.coreName);
  if (!key) return [];
  return balls.filter((b) => b.id !== ball.id && kinKey(b.coreName) === key).sort(newestFirst);
}

/** Every other ball in the same cover, newest first. Empty where the cover
 *  names only a kind ("Pearl Reactive"). */
export function sameCover(balls: readonly CatalogBall[], ball: CatalogBall): CatalogBall[] {
  const key = rowKey(ball.coverstockRaw);
  if (!key) return [];
  return balls.filter((b) => b.id !== ball.id && kinKey(b.coverstockRaw) === key).sort(newestFirst);
}

/**
 * The names a filter offers: one per key, spelled the way most balls spell it
 * (the first such spelling on a tie), in alphabetical order.
 */
export function kinNames(names: readonly (string | null | undefined)[]): string[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const name of names) {
    const key = kinKey(name);
    if (!key || !name) continue;
    const counts = spellings.get(key) ?? new Map<string, number>();
    const spelling = name.trim();
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const chosen: string[] = [];
  for (const counts of spellings.values()) {
    let best = "";
    let bestCount = 0;
    for (const [spelling, count] of counts) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    chosen.push(best);
  }
  return chosen.sort((a, b) => a.localeCompare(b));
}
