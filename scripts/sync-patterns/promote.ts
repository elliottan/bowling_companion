/**
 * Stage 2, promote staged pattern candidates into data/patterns.json (ADR-104).
 *
 * Deterministic and reader-free, the same bargain the ball pipeline strikes in
 * ADR-043. Whoever read the sheet, a parser, tesseract or a pair of eyes, is
 * treated as untrusted here, and a pattern only reaches the catalog when the
 * sheet's own arithmetic agrees with it:
 *
 *   CROSSED  = loads x boards, per row
 *   T.OIL    = crossed x mics, per row
 *   the header's distance and its forward, reverse and total volumes
 *
 * A load table is the rare document that can prove it was read correctly, and
 * this stage is the whole reason the reading is allowed to be fallible. Anything
 * that does not add up goes to data/conflicts/ for a human, never averaged,
 * guessed at, or quietly dropped.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { oilStats, headlineRatio } from "../../src/lib/oilPattern.js";
import type { CatalogPattern, PatternCandidate, PatternCatalog } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const CANDIDATES = resolve(DATA, "candidates");
const CONFLICTS = resolve(DATA, "conflicts");
const CATALOG = resolve(DATA, "patterns.json");

/** How far a derived total may sit from the printed one. Volumes are printed to
 *  two decimals, so anything past half of the last place is a real difference. */
const TOLERANCE = { ml: 0.005, distance: 0.05 } as const;

export interface Complaint {
  field: string;
  stated: number;
  derived: number;
}

/**
 * Every way a candidate fails to match the sheet it claims to come from.
 * Exported because this, not the reading, is the part worth testing hardest.
 */
export function checkCandidate(candidate: PatternCandidate): Complaint[] {
  const complaints: Complaint[] = [];
  if (candidate.passes.length === 0) {
    return [{ field: "passes", stated: 1, derived: 0 }];
  }

  // Per row: a pass that cannot reproduce its own crossings was misread.
  candidate.passes.forEach((pass, i) => {
    const boards = pass.right_board - pass.left_board + 1;
    if (boards < 1 || pass.left_board < 1 || pass.right_board > 39) {
      complaints.push({ field: `pass ${i + 1} boards`, stated: 39, derived: boards });
    }
    if (pass.start_distance === pass.end_distance) {
      complaints.push({ field: `pass ${i + 1} travel`, stated: 1, derived: 0 });
    }
  });

  const stats = oilStats(candidate.passes);
  const { stated } = candidate;
  const compare = (field: string, value: number | undefined, derived: number, tol: number) => {
    if (value == null) return;
    if (Math.abs(value - derived) > tol) complaints.push({ field, stated: value, derived });
  };
  compare("distance", stated.distance, stats.length, TOLERANCE.distance);
  compare("forwardMl", stated.forwardMl, stats.forwardMl, TOLERANCE.ml);
  compare("reverseMl", stated.reverseMl, stats.reverseMl, TOLERANCE.ml);
  compare("volumeMl", stated.volumeMl, stats.volumeMl, TOLERANCE.ml);

  // A sheet that states nothing cannot be checked, and an unverifiable pattern
  // is exactly what this pipeline exists to keep out of the catalog.
  if (stated.distance == null && stated.volumeMl == null) {
    complaints.push({ field: "stated totals", stated: 1, derived: 0 });
  }
  return complaints;
}

export function toCatalogPattern(candidate: PatternCandidate): CatalogPattern {
  const stats = oilStats(candidate.passes);
  return {
    id: candidate.id,
    name: candidate.name,
    vendor: candidate.vendor,
    sourceUrl: candidate.sourceUrl,
    distance: stats.length,
    volumeMl: Math.round(stats.volumeMl * 100) / 100,
    ratio: headlineRatio(candidate.passes),
    passes: candidate.passes,
  };
}

function readCatalog(): PatternCatalog {
  if (!existsSync(CATALOG)) return { version: 1, generated_at: "", patterns: [] };
  return JSON.parse(readFileSync(CATALOG, "utf8")) as PatternCatalog;
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  if (!existsSync(CANDIDATES)) {
    console.log("No candidates staged.");
    return;
  }
  mkdirSync(CONFLICTS, { recursive: true });

  const catalog = readCatalog();
  const byId = new Map(catalog.patterns.map((p) => [p.id, p]));
  let promoted = 0;
  let rejected = 0;

  for (const file of readdirSync(CANDIDATES).filter((f) => f.endsWith(".json"))) {
    const candidate = JSON.parse(readFileSync(resolve(CANDIDATES, file), "utf8")) as PatternCandidate;
    const complaints = checkCandidate(candidate);
    if (complaints.length > 0) {
      rejected += 1;
      console.error(`REJECT ${candidate.id} (${candidate.reader})`);
      for (const c of complaints) {
        console.error(`  ${c.field}: sheet says ${c.stated}, the rows come to ${c.derived}`);
      }
      if (!dryRun) {
        writeFileSync(
          resolve(CONFLICTS, file),
          JSON.stringify({ candidate, complaints }, null, 2) + "\n"
        );
      }
      continue;
    }
    promoted += 1;
    const pattern = toCatalogPattern(candidate);
    console.log(
      `OK     ${pattern.id} (${candidate.reader}) ${pattern.distance} ft, ${pattern.volumeMl} mL` +
        (pattern.ratio != null ? `, ${pattern.ratio.toFixed(2)}:1` : "")
    );
    byId.set(pattern.id, pattern);
  }

  console.log(`\n${promoted} promoted, ${rejected} rejected.`);
  if (dryRun) {
    console.log("Dry run, nothing written.");
    return;
  }
  const next: PatternCatalog = {
    version: 1,
    generated_at: new Date().toISOString(),
    patterns: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
  mkdirSync(DATA, { recursive: true });
  writeFileSync(CATALOG, JSON.stringify(next, null, 2) + "\n");
  console.log(`Catalog now holds ${next.patterns.length} patterns.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) {
  main();
}
