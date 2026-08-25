/**
 * Stage 3, promote staged candidates into data/balls.json.
 *
 * Usage:
 *   npm run promote-candidates              # promote data/candidates/*.json
 *   npm run promote-candidates -- --dry-run # report only, write nothing
 *
 * Deterministic and model-free, by design. The extraction stage is a language
 * model and is therefore treated as an untrusted reader: this stage re-checks
 * every receipt it produced, and a ball only reaches balls.json when each of
 * its values is quoted from a named source, corroborated where the source is
 * not official, and free of collisions with a ball already in the catalog.
 * Anything else is written to data/conflicts/ for a human, never averaged,
 * guessed at, or silently dropped.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeName, slug } from "../normalize.js";
import { validateRaw } from "../validate.js";
import type { RawBall } from "../types.js";
import type { BallCandidate, Evidence, Readings } from "./types.js";

/**
 * How far two independent readings of the same number may sit apart and still
 * count as the same number. Sized to the rounding real spec sheets publish at:
 * RG is quoted to two decimals, differentials to three.
 */
const TOLERANCE = { rg: 0.01, diff: 0.002, mbDiff: 0.002 } as const;

// ---------------------------------------------------------------------------
// Receipt checking
// ---------------------------------------------------------------------------

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Loose containment test: case and whitespace are noise, everything else isn't. */
function quoteContains(quote: string, needle: string): boolean {
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return flat(quote).includes(flat(needle));
}

/**
 * A number is present in its quote if the quote contains the digits, at any
 * trailing-zero padding the source happened to print (2.5, 2.50, 0.050 / .050).
 */
function quoteContainsNumber(quote: string, value: number): boolean {
  const forms = new Set<string>();
  for (let dp = 0; dp <= 4; dp++) {
    const fixed = value.toFixed(dp);
    if (Number(fixed) !== value) continue;
    forms.add(fixed);
    if (fixed.startsWith("0.")) forms.add(fixed.slice(1));
  }
  forms.add(String(value));
  return [...forms].some((f) => quote.includes(f));
}

function receiptProblems<T>(field: string, r: Evidence<T>, isNumber: boolean): string[] {
  const problems: string[] = [];
  if (!r.sourceUrl || !r.sourceUrl.trim()) problems.push(`${field}: reading has no sourceUrl`);
  // A parser's output is checked by its own tests, not by a quote.
  if (r.parser) return problems;
  if (!r.quote || !r.quote.trim()) problems.push(`${field}: reading has no quote`);
  if (!r.quote) return problems;
  const present = isNumber
    ? quoteContainsNumber(r.quote, r.value as unknown as number)
    : quoteContains(r.quote, String(r.value));
  if (!present) {
    problems.push(`${field}: value ${JSON.stringify(r.value)} does not appear in its quote`);
  }
  return problems;
}

export interface Resolved<T> {
  value: T | null;
  problems: string[];
  sourceUrls: string[];
}

/**
 * Reduce the readings of one field to a single value, or to the reason it
 * cannot be reduced. `official` relaxes the corroboration requirement only;
 * the receipt requirement holds either way.
 */
export function resolveField<T extends string | number | object>(
  field: string,
  readings: Readings<T> | undefined,
  official: boolean,
  tolerance?: number
): Resolved<T> {
  const list = readings ?? [];
  if (list.length === 0) return { value: null, problems: [], sourceUrls: [] };

  const isNumber = typeof list[0].value === "number";
  const problems = list.flatMap((r) => receiptProblems(field, r, isNumber));
  const sourceUrls = [...new Set(list.map((r) => r.sourceUrl).filter(Boolean))];

  if (!official && list.some((r) => !r.parser)) {
    const hosts = new Set(list.map((r) => host(r.sourceUrl)));
    if (hosts.size < 2) {
      problems.push(
        `${field}: no official source, so needs readings from 2 different sites (got ${hosts.size})`
      );
    }
  }

  // Disagreement is a question for a human, never an average.
  const [first, ...rest] = list;
  for (const r of rest) {
    if (isNumber) {
      const gap = Math.abs((r.value as number) - (first.value as number));
      if (gap > (tolerance ?? 0)) {
        problems.push(
          `${field}: sources disagree: ${first.value} (${host(first.sourceUrl)}) vs ${r.value} (${host(r.sourceUrl)})`
        );
      }
    } else if (typeof first.value === "string") {
      const same =
        String(r.value).toLowerCase().replace(/\s+/g, " ").trim() ===
        String(first.value).toLowerCase().replace(/\s+/g, " ").trim();
      if (!same) {
        problems.push(
          `${field}: sources disagree: ${JSON.stringify(first.value)} vs ${JSON.stringify(r.value)}`
        );
      }
    }
  }

  return { value: problems.length > 0 ? null : first.value, problems, sourceUrls };
}

export interface PromoteResult {
  ok: boolean;
  ball: RawBall | null;
  problems: string[];
}

/**
 * Key that decides "is this the same ball", punctuation, case and roman
 * numerals are not identity. Storm styles its IQ line "!Q", so a bare strip of
 * punctuation leaves "q tour" against "iq tour" and the same ball enters the
 * catalog twice; the exclamation mark is read as the letter it stands in for.
 */
export function identityKey(brand: string, name: string): string {
  return `${brand.toLowerCase().trim()}|${normalizeName(name.replace(/!/g, "i"))}`;
}

/**
 * Turn one candidate into a RawBall, or into the list of reasons it is not
 * ready. `existing` is the catalog as it stands; a candidate that collides with
 * it is a question (update? colorway? genuinely a new ball?) and is refused
 * here rather than appended as a duplicate.
 */
export function promoteCandidate(c: BallCandidate, existing: RawBall[]): PromoteResult {
  const problems: string[] = [];
  const fields = {
    releaseDate: resolveField("releaseDate", c.releaseDate, c.official),
    coverstockRaw: resolveField("coverstockRaw", c.coverstockRaw, c.official),
    factoryFinish: resolveField("factoryFinish", c.factoryFinish, c.official),
    coreName: resolveField("coreName", c.coreName, c.official),
    rg: resolveField("rg", c.rg, c.official, TOLERANCE.rg),
    diff: resolveField("diff", c.diff, c.official, TOLERANCE.diff),
    mbDiff: resolveField("mbDiff", c.mbDiff, c.official, TOLERANCE.mbDiff),
    weights: resolveField("weights", c.weights, c.official),
    colorways: resolveField("colorways", c.colorways, c.official),
  };
  for (const f of Object.values(fields)) problems.push(...f.problems);

  const key = identityKey(c.brand, c.name);
  if (existing.some((b) => identityKey(b.brand, b.name) === key)) {
    problems.push(
      `collides with a ball already in balls.json. Decide by hand: update it, add a colorway, or rename this one`
    );
  }

  const sourceUrls = [...new Set(Object.values(fields).flatMap((f) => f.sourceUrls))];
  const ball: RawBall = {
    brand: c.brand,
    name: c.name,
    releaseDate: fields.releaseDate.value,
    coverstockRaw: fields.coverstockRaw.value ?? "",
    factoryFinish: fields.factoryFinish.value,
    coreName: fields.coreName.value,
    rg: fields.rg.value,
    diff: fields.diff.value,
    mbDiff: fields.mbDiff.value,
    sourceUrls,
    ...(fields.productUrl?.value ? { productUrl: fields.productUrl.value } : {}),
    ...(fields.weights.value ? { weights: fields.weights.value } : {}),
    ...(fields.colorways.value ? { colorways: fields.colorways.value } : {}),
  };

  problems.push(...validateRaw(ball));
  return { ok: problems.length === 0, ball: problems.length === 0 ? ball : null, problems };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(): void {
  // Resolved inside main so importing this module for its pure functions (the
  // tests do) never touches import.meta.url.
  const DATA = resolve(fileURLToPath(new URL(".", import.meta.url)), "../data");
  const BALLS_JSON = resolve(DATA, "balls.json");
  const CANDIDATE_DIR = resolve(DATA, "candidates");
  const CONFLICT_DIR = resolve(DATA, "conflicts");

  const dryRun = process.argv.includes("--dry-run");
  if (!existsSync(CANDIDATE_DIR)) {
    console.log("No data/candidates/ directory: nothing to promote.");
    return;
  }
  const files = readdirSync(CANDIDATE_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No candidates staged.");
    return;
  }

  const balls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  mkdirSync(CONFLICT_DIR, { recursive: true });

  const promoted: string[] = [];
  const refused: string[] = [];

  for (const file of files) {
    const path = resolve(CANDIDATE_DIR, file);
    const candidate: BallCandidate = JSON.parse(readFileSync(path, "utf-8"));
    const result = promoteCandidate(candidate, balls);
    const label = `${candidate.brand} ${candidate.name}`;

    if (result.ok && result.ball) {
      balls.push(result.ball);
      promoted.push(label);
      if (!dryRun) rmSync(path);
      continue;
    }

    refused.push(`${label}\n      - ${result.problems.join("\n      - ")}`);
    if (dryRun) continue;
    const year = candidate.releaseDate?.[0]?.value?.slice(0, 4);
    const id = slug(candidate.brand, candidate.name, year ? parseInt(year, 10) : null);
    writeFileSync(
      resolve(CONFLICT_DIR, `${id}.json`),
      JSON.stringify({ problems: result.problems, candidate }, null, 2) + "\n"
    );
    rmSync(path);
  }

  if (!dryRun && promoted.length > 0) {
    writeFileSync(BALLS_JSON, JSON.stringify(balls, null, 2) + "\n");
  }

  console.log(`\n=== Promote ${dryRun ? "(dry run) " : ""}===`);
  console.log(`  Promoted (${promoted.length}): ${promoted.join(", ") || "none"}`);
  console.log(`  Refused  (${refused.length}):`);
  for (const r of refused) console.log(`    ${r}`);
  if (!dryRun && refused.length > 0) console.log(`  Conflicts written to ${CONFLICT_DIR}`);
  if (!dryRun && promoted.length > 0) console.log(`  Wrote ${BALLS_JSON}: run npm run sync-catalog next`);
}

if (process.argv[1] && process.argv[1].endsWith("promote.ts")) main();
