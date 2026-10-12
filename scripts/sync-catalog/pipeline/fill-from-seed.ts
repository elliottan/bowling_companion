/**
 * Fill the gaps in rows already in balls.json from a parser's staged output.
 *
 * Usage:
 *   npm run fill-from-seed -- bowwwl-seed.json            # report only
 *   npm run fill-from-seed -- bowwwl-seed.json --write    # apply
 *   npm run fill-from-seed -- bowwwl-seed.json --write --confirms-search
 *
 * `promote` only adds new balls, and refuses one that collides with a row
 * already there. This is the other half: a row that is in the catalog with
 * fields missing (a release date, a core name, a fuller coverstock name, the
 * per-weight table) takes them from a deterministic parser's reading of the
 * source page (ADR-044), and nothing already there is overwritten.
 *
 * Fill-only is the rule that keeps this safe to run unattended:
 *  - A number the row has and the page disagrees with is reported, never
 *    changed, and the whole row is left alone: a page that disagrees on a
 *    number may be a different variant of the ball. RG and differentials use
 *    promote's tolerances.
 *  - A text field is replaced only by a fuller form of itself (the page's
 *    "HK22 - Aggression Solid Reactive" for the row's "Aggression Solid"), or
 *    by a name the build can classify where the row's it could not.
 *  - A release date filled into a row that had none pins the row's current id
 *    first (ADR-137), so an arsenal ball holding that id keeps its link.
 *
 * `--confirms-search` also removes `readVia` from a row the page has agreed
 * with on RG, differential and mass bias: the page has re-read what a web
 * search summary said, which is what the marker was waiting for.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mapCoverstock, slug } from "../normalize.js";
import type { RawBall } from "../types.js";
import { identityKey } from "./promote.js";

type Staged = RawBall & { _imageUrl?: string | null; _discontinued?: boolean };

const TOLERANCE = { rg: 0.01, diff: 0.002, mbDiff: 0.002 } as const;

export interface FillResult {
  row: RawBall;
  /** What changed, one line each, for the report. */
  changes: string[];
  /** What the page and the row disagree on and was left alone. */
  conflicts: string[];
  /** True when RG, differential and mass bias all agree with the page. */
  numbersAgree: boolean;
}

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A page date as precise as the page is sure of: a padded year is a year. */
export function pageDate(value: string | null): string | null {
  if (!value) return null;
  return /-01-01$/.test(value) ? value.slice(0, 4) : value;
}

function sameNumber(a: number | null, b: number | null, tol: number): boolean {
  return a == null || b == null ? a === b : Math.abs(a - b) <= tol;
}

/** Is `fuller` a more specific form of `plain`, naming the same thing? */
function isFuller(plain: string, fuller: string): boolean {
  return flat(fuller).length > flat(plain).length && flat(fuller).includes(flat(plain));
}

export function fillRow(row: RawBall, page: Staged): FillResult {
  const out: RawBall = { ...row };
  const changes: string[] = [];
  const conflicts: string[] = [];

  // Numbers: fill what is missing, report what disagrees.
  let numbersAgree = true;
  for (const k of ["rg", "diff", "mbDiff"] as const) {
    const have = row[k];
    const seen = page[k];
    if (have == null && seen != null) {
      out[k] = seen;
      changes.push(`${k} ${seen}${k === "mbDiff" ? " (the row read as symmetric)" : ""}`);
      if (k === "mbDiff") numbersAgree = false;
    } else if (!sameNumber(have, seen, TOLERANCE[k])) {
      conflicts.push(`${k} ${have} in the row, ${seen} on the page`);
      numbersAgree = false;
    }
  }

  // Release date.
  const date = pageDate(page.releaseDate);
  if (date) {
    if (!row.releaseDate) {
      if (!out.id) out.id = slug(row.brand, row.name, null);
      out.releaseDate = date;
      changes.push(`releaseDate ${date} (id pinned to ${out.id})`);
    } else if (row.releaseDate !== date) {
      if (date.startsWith(row.releaseDate) && date.length > row.releaseDate.length) {
        out.releaseDate = date;
        changes.push(`releaseDate ${row.releaseDate} to ${date}`);
      } else if (!row.releaseDate.startsWith(date.slice(0, 4))) {
        conflicts.push(`releaseDate ${row.releaseDate} in the row, ${date} on the page`);
      }
    }
  }

  // Core: fill, or take the fuller name.
  if (page.coreName) {
    if (!row.coreName) {
      out.coreName = page.coreName;
      changes.push(`coreName "${page.coreName}"`);
    } else if (isFuller(row.coreName, page.coreName)) {
      out.coreName = page.coreName;
      changes.push(`coreName "${row.coreName}" to "${page.coreName}"`);
    }
  }

  if (!row.factoryFinish && page.factoryFinish) {
    out.factoryFinish = page.factoryFinish;
    changes.push(`factoryFinish "${page.factoryFinish}"`);
  }

  // Coverstock: only a fuller form of the same name, or one the build can
  // classify where the row's could not. The page's bare "Solid Reactive" is
  // neither, so a ball whose page lost the name keeps its own.
  if (page.coverstockRaw && flat(page.coverstockRaw) !== flat(row.coverstockRaw)) {
    const bare = /^(solid|pearl|hybrid)( particle)? reactive$/i.test(page.coverstockRaw.trim());
    const classifiesBetter =
      mapCoverstock(row.coverstockRaw) === null && mapCoverstock(page.coverstockRaw) !== null && !bare;
    if (isFuller(row.coverstockRaw, page.coverstockRaw) || classifiesBetter) {
      out.coverstockRaw = page.coverstockRaw;
      changes.push(`coverstockRaw "${row.coverstockRaw}" to "${page.coverstockRaw}"`);
    }
  }

  if (!row.weights && page.weights?.length) {
    out.weights = page.weights;
    changes.push(`weights ${page.weights.map((w) => w.weight).join("/")} lb`);
  }

  const src = page.sourceUrls.find((u) => u && u !== "-");
  if (src && !row.sourceUrls.includes(src)) {
    out.sourceUrls = [...row.sourceUrls, src];
    changes.push("sourceUrl added");
  }

  return { row: out, changes, conflicts, numbersAgree };
}

function main(): void {
  const DATA = resolve(fileURLToPath(new URL(".", import.meta.url)), "../data");
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run fill-from-seed -- <seed-file.json> [--write] [--confirms-search]");
    process.exit(1);
  }
  const write = process.argv.includes("--write");
  const confirmsSearch = process.argv.includes("--confirms-search");

  const staged: Staged[] = JSON.parse(readFileSync(resolve(DATA, "seed", file), "utf-8"));
  const balls: RawBall[] = JSON.parse(readFileSync(resolve(DATA, "balls.json"), "utf-8"));

  let touched = 0;
  let conflicted = 0;
  let unmatched = 0;
  for (const page of staged) {
    const at = balls.findIndex((b) => identityKey(b.brand, b.name) === identityKey(page.brand, page.name));
    if (at === -1) {
      unmatched++;
      continue;
    }
    const result = fillRow(balls[at], page);
    if (confirmsSearch && result.numbersAgree && result.row.readVia) {
      delete result.row.readVia;
      result.changes.push("readVia removed (page agrees on RG, differential and mass bias)");
    }
    if (result.conflicts.length > 0) {
      // A page that disagrees on a number may be a different variant of the
      // ball, so nothing from it is taken, its date included.
      conflicted++;
      console.log(`! ${page.brand} ${page.name} (left alone)\n    ${result.conflicts.join("\n    ")}`);
      continue;
    }
    if (result.changes.length > 0) {
      touched++;
      console.log(`+ ${page.brand} ${page.name}\n    ${result.changes.join("\n    ")}`);
      balls[at] = result.row;
    }
  }

  console.log(
    `\n${touched} rows would change, ${conflicted} with a disagreement, ${unmatched} staged balls not in the catalog.`
  );
  if (write) {
    writeFileSync(resolve(DATA, "balls.json"), JSON.stringify(balls, null, 2) + "\n");
    console.log("Wrote balls.json. Run npm run sync-catalog next.");
  } else {
    console.log("Report only. Add --write to apply.");
  }
}

if (process.argv[1] && process.argv[1].endsWith("fill-from-seed.ts")) main();
