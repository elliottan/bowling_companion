/**
 * Stage 2 router, decide how each queued ball will be read, before reading any.
 *
 * Usage:
 *   npm run resolve-sources -- data/queue/<run-id>.json
 *   npm run resolve-sources -- data/queue/<run-id>.json --concurrency 4
 *
 * Writes <run-id>.routed.json alongside the queue: every ball tagged pdf,
 * bowwwl or manual, with the URL that answered. Doing this as its own pass is
 * what keeps a run predictable, you see up front that 60 balls parse for free
 * and 17 need a model, instead of discovering it a token at a time.
 *
 * HEAD requests only. Nothing is downloaded and nothing is parsed here.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { routeBall, type RoutedBall } from "./sources.js";
import type { QueueEntry } from "./types.js";

/** Small pool: the CDN is someone else's, and a queue is tens of balls, not thousands. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function main(): Promise<void> {
  const [queuePath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!queuePath) {
    console.error(
      "Usage: npm run resolve-sources -- <queue-file.json> [--concurrency N] [--try-base-names]"
    );
    process.exit(1);
  }
  const cArg = process.argv.indexOf("--concurrency");
  const concurrency = cArg >= 0 ? parseInt(process.argv[cArg + 1], 10) : 4;
  const tryBaseName = process.argv.includes("--try-base-names");

  const abs = resolve(process.cwd(), queuePath);
  const queue: QueueEntry[] = JSON.parse(readFileSync(abs, "utf-8"));
  const routed: RoutedBall[] = await mapPool(queue, concurrency, (e) =>
    routeBall(e.brand, e.name, tryBaseName)
  );

  const out = abs.replace(/\.json$/, ".routed.json");
  writeFileSync(out, JSON.stringify(routed, null, 2) + "\n");

  const counts = routed.reduce<Record<string, number>>((acc, r) => {
    acc[r.route] = (acc[r.route] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n=== Routes ===`);
  console.log(`  pdf    ${counts.pdf ?? 0}  (npm run parse-ball, free)`);
  console.log(`  motiv  ${counts.motiv ?? 0}  (npm run parse-motiv, free)`);
  console.log(`  bowwwl ${counts.bowwwl ?? 0}  (npm run parse-bowwwl, free)`);
  console.log(`  manual ${counts.manual ?? 0}  (a model reads these, with quotes)`);
  const reduced = routed.filter((r) => r.nameUsed);
  if (reduced.length > 0) {
    console.log(`\n  Matched under a shorter name. Check each one: a "/" can mean`);
    console.log(`  a colourway, or a different ball entirely.`);
    for (const r of reduced) console.log(`    ${r.brand} ${r.name}  ->  ${r.nameUsed}`);
  }
  console.log(`\n  Wrote ${out}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
