/**
 * Fold a manufacturer's per-colourway pages into one ball, before promote.
 *
 * Usage:
 *   npm run fold-colorways -- motiv-seed.json            # report only
 *   npm run fold-colorways -- motiv-seed.json --write    # rewrite the seed
 *
 * MOTIV files each colourway of a ball as its own product page, so a parser
 * that works a page at a time stages the Aspire four times over. Promoted as
 * they parse, those become four balls that share every spec and differ only in
 * the colour printed on them, which is what `colorways` exists to express.
 *
 * Folding cannot happen in the parser, which sees one page, and promote has no
 * way to merge separate candidates, so it happens here: between the parser and
 * the candidates, on the staged output a human is meant to review anyway.
 *
 * WHAT IT WILL NOT DO. MOTIV's naming does not mark colourways reliably. Some
 * append the colour with a separator ("Aspire - Navy/Red/Blue"), some without
 * ("Ascent Pearl Pink/Purple"), and the same separator also carries edition
 * labels that are part of the name ("T10 - Limited Edition"). Reading every
 * one of those shapes means guessing, and a wrong guess files two different
 * balls as one ball's colourways, which no later stage would catch.
 *
 * So a group folds only on all three of:
 *   - the names share a base before " - ", the one shape that is unambiguous;
 *   - two or more pages carry that base, since one page is a name, not a set;
 *   - their specs are identical, which is the actual evidence of one ball.
 *
 * Release dates are excluded from that comparison: MOTIV shipped the Thrill's
 * three colours on three dates, and they are still one ball. The folded ball
 * takes the earliest, being when the ball itself arrived.
 *
 * Everything else is left alone and reported, for a person to decide.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { StagedBall } from "../catalog/parse-motiv.js";
import type { Colorway } from "../../../src/types/catalog.js";

/** A staged ball, plus the per-colourway image URLs once folded. */
export type FoldedBall = StagedBall & { _colorwayImages?: Record<string, string> };

/** The spec fields that decide whether two pages describe the same ball. */
function specKey(b: StagedBall): string {
  return JSON.stringify([b.coverstockRaw, b.coreName, b.rg, b.diff, b.mbDiff, b.factoryFinish]);
}

function base(name: string): string | null {
  const at = name.indexOf(" - ");
  return at > 0 ? name.slice(0, at) : null;
}

function colour(name: string): string | null {
  const at = name.indexOf(" - ");
  return at > 0 ? name.slice(at + 3).trim() || null : null;
}

export interface FoldResult {
  balls: FoldedBall[];
  folded: { name: string; from: number }[];
  /** Groups that share a base name but were left alone, with the reason. */
  skipped: { name: string; reason: string }[];
}

export function foldColorways(staged: StagedBall[]): FoldResult {
  const groups = new Map<string, StagedBall[]>();
  for (const b of staged) {
    const g = base(b.name);
    if (g) groups.set(g, [...(groups.get(g) ?? []), b]);
  }

  const folded: FoldResult["folded"] = [];
  const skipped: FoldResult["skipped"] = [];
  const consumed = new Set<StagedBall>();
  const out: FoldedBall[] = [];

  for (const [name, rows] of groups) {
    if (rows.length < 2) {
      // One page is a name that happens to contain " - ", not a set of
      // colourways: "T10 - Limited Edition" is the ball's whole name.
      skipped.push({ name: rows[0].name, reason: "only one page carries this base name" });
      continue;
    }
    if (new Set(rows.map(specKey)).size > 1) {
      skipped.push({ name, reason: `${rows.length} pages, but their specs differ` });
      continue;
    }

    const dates = rows.map((r) => r.releaseDate).filter((d): d is string => d !== null).sort();
    const colorways: Colorway[] = rows.map((r) => ({
      sku: r._sku ?? "",
      color: colour(r.name),
    }));
    const images: Record<string, string> = {};
    for (const r of rows) if (r._sku && r._imageUrl) images[r._sku] = r._imageUrl;

    out.push({
      ...rows[0],
      name,
      releaseDate: dates[0] ?? null,
      colorways,
      sourceUrls: rows.flatMap((r) => r.sourceUrls),
      // MOTIV have no page for the folded ball under its own name, so the
      // first colourway's page is the link to them for it.
      productUrl: rows[0].productUrl ?? rows[0].sourceUrls[0] ?? null,
      _colorwayImages: images,
    });
    for (const r of rows) consumed.add(r);
    folded.push({ name, from: rows.length });
  }

  for (const b of staged) if (!consumed.has(b)) out.push(b);
  return { balls: out, folded, skipped };
}

function main(): void {
  const DATA = resolve(fileURLToPath(new URL(".", import.meta.url)), "../data");
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run fold-colorways -- <seed-file.json> [--write]");
    process.exit(1);
  }
  const path = resolve(DATA, "seed", file);
  const staged: StagedBall[] = JSON.parse(readFileSync(path, "utf-8"));
  const { balls, folded, skipped } = foldColorways(staged);

  console.log(`\n=== Fold colourways ===`);
  console.log(`  ${staged.length} staged -> ${balls.length} ball(s)`);
  for (const f of folded) console.log(`  folded  ${f.name}  (${f.from} pages)`);
  if (skipped.length > 0) {
    console.log(`\n  Left alone, decide by hand:`);
    for (const s of skipped) console.log(`    ${s.name}: ${s.reason}`);
  }

  if (process.argv.includes("--write")) {
    writeFileSync(path, JSON.stringify(balls, null, 2) + "\n");
    console.log(`\n  Wrote ${path}`);
  } else {
    console.log(`\n  Report only. Pass --write to rewrite the seed.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("fold-colorways.ts")) main();
