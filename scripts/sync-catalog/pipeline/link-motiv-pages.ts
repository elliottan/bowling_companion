/**
 * Give every MOTIV ball a link to MOTIV's own page for it.
 *
 * Usage:
 *   npm run link-motiv-pages              # report only
 *   npm run link-motiv-pages -- --write   # fill in the missing links
 *
 * MOTIV's licence asks that a ball listing link to the manufacturer's page for
 * any ball that has one, so a reader can check the specs against the source.
 * Balls read by `parse-motiv` already carry it: the page it parsed is the page
 * to link. The ones read before that route existed cite bowwwl or a review
 * site, which is honest about where their specs came from and is not a link to
 * MOTIV.
 *
 * `productUrl` is a separate field from `sourceUrls` for exactly that reason. A
 * row keeps saying where its numbers were read while pointing at MOTIV for the
 * ball itself; overwriting the citation would buy the link by falsifying the
 * provenance.
 *
 * The link is looked up in MOTIV's sitemap by slug, never constructed. A ball
 * their sitemap does not list gets no link and is reported.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { motivUrl } from "./sources.js";
import type { RawBall } from "../types.js";

async function main(): Promise<void> {
  const BALLS = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../data/balls.json"
  );
  const balls: RawBall[] = JSON.parse(readFileSync(BALLS, "utf-8"));

  const linked: string[] = [];
  const missing: string[] = [];
  let already = 0;

  for (const ball of balls) {
    if (ball.brand !== "Motiv") continue;
    if (ball.productUrl) {
      already++;
      continue;
    }
    // A folded ball has no page under its own name, since MOTIV file each
    // colourway separately, but the pages it was folded from are already cited
    // and are MOTIV's own. Prefer the sitemap; fall back to what it cites.
    const cited = ball.sourceUrls.find((u) => u.startsWith("https://www.motivbowling.com/"));
    const url = (await motivUrl(ball.name)) ?? cited ?? null;
    if (url) {
      ball.productUrl = url;
      linked.push(`${ball.name} -> ${url.replace("https://www.motivbowling.com", "")}`);
    } else {
      missing.push(ball.name);
    }
  }

  console.log(`\n=== Link MOTIV pages ===`);
  console.log(`  ${already} already linked, ${linked.length} to link, ${missing.length} not on their site`);
  for (const l of linked) console.log(`  + ${l}`);
  if (missing.length > 0) {
    console.log(`\n  No page in MOTIV's sitemap, left without a link:`);
    for (const m of missing) console.log(`    ${m}`);
  }

  if (process.argv.includes("--write")) {
    writeFileSync(BALLS, JSON.stringify(balls, null, 2) + "\n");
    console.log(`\n  Wrote ${BALLS}: run npm run sync-catalog next`);
  } else {
    console.log(`\n  Report only. Pass --write to fill them in.`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
