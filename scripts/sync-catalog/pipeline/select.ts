/**
 * Stage 1, choose what a run covers, and write it as a queue file.
 *
 * Usage:
 *   npm run select-balls -- --since 2026-01-01
 *   npm run select-balls -- --since 2026-01-01 --until 2026-06-30 --brand Storm
 *   npm run select-balls -- --name "Storm:Phaze V" --name "Motiv:Venom Shock"
 *
 * The spine is data/usbc-index.json: every USBC-approved ball with its approval
 * date. Diffing it against balls.json is how "what is new" gets answered without
 * scraping anything, and the date range is what makes a run a phase rather than
 * a boil-the-ocean job. `--name` bypasses the diff for a hand-picked list.
 *
 * Output is data/queue/<run-id>.json. Nothing is fetched here; this stage only
 * decides scope, so it is cheap to re-run and safe to throw away.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeName } from "../normalize.js";
import type { RawBall } from "../types.js";
import { identityKey } from "./promote.js";
import type { QueueEntry } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DATA = resolve(__dirname, "../data");
const BALLS_JSON = resolve(DATA, "balls.json");
const USBC_JSON = resolve(DATA, "usbc-index.json");
const QUEUE_DIR = resolve(DATA, "queue");

interface UsbcEntry {
  brand: string;
  name: string;
  normalizedName: string;
  approvalDate: string;
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function args(flag: string): string[] {
  return process.argv.reduce<string[]>((acc, a, i) => {
    if (a === flag && process.argv[i + 1]) acc.push(process.argv[i + 1]);
    return acc;
  }, []);
}

/**
 * USBC lists a row per colorway ("Cruise (PC) Purple/Copper"), so the raw list
 * over-counts badly. Dropping parentheticals and collapsing duplicates gets the
 * queue close to one row per ball; the colour suffixes that survive are left for
 * the extraction stage, which sees the real product page and knows better.
 */
function queueName(name: string): string {
  return name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function main(): void {
  const since = arg("--since");
  const until = arg("--until");
  const brand = arg("--brand");
  const limit = arg("--limit");
  const names = args("--name");

  const balls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  const have = new Set(balls.map((b) => identityKey(b.brand, b.name)));

  let entries: QueueEntry[];

  if (names.length > 0) {
    // "Brand:Name" pairs, taken as given.
    entries = names.map((n) => {
      const [b, ...rest] = n.split(":");
      return { brand: b.trim(), name: rest.join(":").trim(), via: "--name" };
    });
  } else {
    const usbc: UsbcEntry[] = JSON.parse(readFileSync(USBC_JSON, "utf-8"));
    const seen = new Set<string>();
    entries = [];
    for (const e of usbc) {
      if (since && e.approvalDate < since) continue;
      if (until && e.approvalDate > until) continue;
      if (brand && e.brand.toLowerCase() !== brand.toLowerCase()) continue;
      const name = queueName(e.name);
      const key = `${e.brand.toLowerCase()}|${normalizeName(name)}`;
      if (seen.has(key) || have.has(key)) continue;
      seen.add(key);
      entries.push({ brand: e.brand, name, via: `usbc-index ${e.approvalDate}` });
    }
  }

  if (limit) entries = entries.slice(0, parseInt(limit, 10));

  const runId = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  mkdirSync(QUEUE_DIR, { recursive: true });
  const out = resolve(QUEUE_DIR, `${runId}.json`);
  writeFileSync(out, JSON.stringify(entries, null, 2) + "\n");

  const byBrand = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.brand] = (acc[e.brand] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n=== Queue ===`);
  console.log(`  ${entries.length} ball(s) not yet in the catalog`);
  for (const [b, n] of Object.entries(byBrand).sort((a, z) => z[1] - a[1])) {
    console.log(`    ${b}: ${n}`);
  }
  console.log(`  Wrote ${out}`);
}

main();
