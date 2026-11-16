/**
 * Runs `pool-bench.ts` in headless Chromium against a dev server, once per
 * worker count, and writes each run as `bench.ts --out` does, so
 * `bench.ts --compare` (or an exact diff) holds the pool to the one-thread
 * readings.
 *
 *   npx vite --port 5191 &
 *   npx tsx scripts/shot-tracker/bench.ts IMG_1996 --dump scripts/shot-tracker/out/dump --out one.json
 *   npx tsx scripts/shot-tracker/pool-bench-run.ts IMG_1996 --workers 1,2,4 --out pool
 *     (pool-1.json, pool-2.json, pool-4.json; `--chromium path` for a browser other than Playwright's own)
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const counts = (opt("--workers") ?? "1,2,4").split(",").map(Number);
const out = opt("--out") ?? "pool";
const origin = opt("--origin") ?? "http://localhost:5191";
const dir = opt("--dir") ?? "/scripts/shot-tracker/out/dump";
const executablePath = opt("--chromium");
const names = args;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.text().startsWith("Shot tracer") && console.log(m.text()));
await page.goto(`${origin}/app`);
for (const workers of counts) {
  const runs = [];
  for (const name of names) {
    const r = await page.evaluate(
      async ([d, n, w]) => {
        const m = await import("/scripts/shot-tracker/pool-bench.ts" as string);
        return m.poolBench(d, n, w);
      },
      [dir, name, workers] as const
    );
    console.log(`${name}, ${workers} workers: first find ${r.ms.firstFind} ms, find ${r.ms.find} ms, trace ${r.ms.trace} ms (${Object.entries(r.stages ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")})`);
    runs.push(r);
  }
  writeFileSync(`${out}-${workers}.json`, JSON.stringify(runs, null, 1) + "\n");
}
await browser.close();
