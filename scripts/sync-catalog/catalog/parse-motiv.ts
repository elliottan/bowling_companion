/**
 * Parse a MOTIV product page into a RawBall staging entry.
 *
 * Usage:
 *   npm run parse-motiv -- <page-url> [<page-url> ...]
 *
 * MOTIV publishes every spec as a labelled table row (`<th>Cover Stock</th>`)
 * and every per-weight number as a headed span inside
 * `product-specifications-by-weight`, so the whole page parses off those labels
 * with no positional guessing and no model tokens. Each parsed ball is appended to
 * data/seed/motiv-seed.json for human review before it is merged into
 * balls.json (same staging flow as the other parsers).
 *
 * This is the manufacturer's own page, so `from-seed` marks its readings
 * official (ADR-043). MOTIV granted use of the site's data in August 2026.
 *
 * The `_imageUrl` field on each staged entry is the absolute URL of the
 * original (un-resized) product image; `add-ball-image` consumes it.
 *
 * TOKEN-SAFE: page HTML never enters a model context.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MOTIV_USER_AGENT } from "../pipeline/sources.js";
import { acronymCoverType } from "./motiv-cover-acronyms.js";
import type { RawBall } from "../types.js";
import type { WeightSpec } from "../../../src/types/catalog.js";

const ORIGIN = "https://www.motivbowling.com";

/**
 * Resolved when the parser runs, not when it is imported: under the test
 * runner `import.meta.url` is not a file URL, and a module that only exports
 * `parsePage` has no business touching the filesystem to be imported at all.
 */
function seedPath(): string {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  return resolve(dir, "../../../", "scripts/sync-catalog/data/seed/motiv-seed.json");
}

/**
 * A staged ball carries the image URL alongside the RawBall fields, and the
 * item number, which is the SKU a colourway is identified by once several
 * pages are folded into one ball.
 */
export type StagedBall = RawBall & {
  _imageUrl: string | null;
  _discontinued: boolean;
  _sku: string | null;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&trade;|™|&reg;|®/g, "");
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text of the `<td>` beside the `<th>` carrying this label. */
function specCell(html: string, label: string): string | null {
  const m = html.match(new RegExp(`<th[^>]*>${escapeRe(label)}</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i"));
  if (!m) return null;
  const text = stripTags(m[1]);
  return text.length > 0 ? text : null;
}

function num(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * ISO date from the release-date span. It reads either "3/28/2014" for a ball
 * already out or "AVAILABLE 8/12/2026" for one still coming, both US
 * month/day/year, so the parts are taken in that order rather than guessed at.
 */
function releaseDate(html: string): string | null {
  const raw = html.match(/class="release-date"[^>]*>([^<]*)</)?.[1];
  const m = raw ? stripTags(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) : null;
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** One `<span class="heading">Label</span> <span class="value">…</span>` pair. */
function headedValue(card: string, heading: string): number | null {
  const m = card.match(
    new RegExp(`<span class="heading">${escapeRe(heading)}</span>\\s*<span class="value">([^<]*)</span>`, "i")
  );
  return m ? num(stripTags(m[1])) : null;
}

/**
 * Each weight is one slide in the by-weight scroller. A symmetric ball simply
 * omits its "Int. Differential" pair, which is the signal for a null mbDiff:
 * the value is never carried over from a heavier weight or another ball.
 *
 * The numbers are read exactly as printed, typos included. MOTIV's Covert VIP
 * EXJ gives its 15 lb differential as "056" where every sibling row reads
 * ".050", and this returns 56 rather than guessing the point back in: promote's
 * range check then refuses the ball, which is the outcome that gets a person to
 * look. A parser that quietly repairs its source cannot be trusted on the
 * values it did not repair.
 */
export function parseWeights(html: string): WeightSpec[] {
  const scroller = html.match(/product-specifications-by-weight[\s\S]*?<\/ul>/)?.[0];
  if (!scroller) return [];
  const weights: WeightSpec[] = [];
  for (const card of scroller.split('<li class="slide">').slice(1)) {
    const lb = card.match(/<h3 class="weight">\s*(\d+)\s*<\/h3>/);
    if (!lb) continue;
    weights.push({
      weight: Number.parseInt(lb[1], 10),
      rg: headedValue(card, "Radius of Gyration"),
      diff: headedValue(card, "Max Differential"),
      mbDiff: headedValue(card, "Int. Differential"),
    });
  }
  return weights.sort((a, b) => b.weight - a.weight);
}

/**
 * The cover type, where MOTIV states it in prose rather than in the spec cell.
 *
 * Their current pages put it in the cell ("Dark Matter Propulsion Pearl
 * Reactive"), but the older ones give only the coverstock's name and leave the
 * type to the copy: the Trident page expands its own acronym as "Coercion HVH
 * (High Volume Hybrid)", and the Jackal page opens "The Jackal is a power
 * pearl". Both are MOTIV describing their own ball on the ball's own page.
 *
 * Only these two shapes are read, and only when the cell has no type of its
 * own. Anything else is left alone for a person to classify, which is what the
 * build's unclassified-coverstock notice is for.
 */
function statedCoverType(html: string): string | null {
  const text = stripTags(html);
  const paren = text.match(/\(([^)]{0,40}(Solid|Pearl|Hybrid|Urethane))\)/i);
  const prose = text.match(/\bis an?\s+(?:power\s+)?(solid|pearl|hybrid|urethane)\b/i);
  const word = paren?.[2] ?? prose?.[1];
  // Title case: the copy is a sentence, the spec cell is a label.
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : null;
}

/**
 * The cover as MOTIV write it, with the type put where their own current pages
 * put it: before "Reactive" when the cell ends that way ("Turmoil HFP Pearl
 * Reactive"), and on the end when it does not ("Turmoil HFS Solid").
 *
 * A trailing "Cover Stock" is dropped first. The cell is already labelled Cover
 * Stock, so the value repeating it is a label rather than part of the name, the
 * same reason the core sheds its "Symmetrical".
 */
function withCoverType(cover: string, type: string | null): string {
  const name = cover.replace(/\s*cover\s*stock\s*$/i, "").trim();
  if (!type) return name;
  return /\breactive\s*$/i.test(name)
    ? name.replace(/\s*reactive\s*$/i, ` ${type} Reactive`)
    : `${name} ${type}`;
}

export function parsePage(html: string, url: string): StagedBall {
  // Anchored on the item number, which is the one thing both page layouts put
  // immediately before the name: a ball on sale wraps its heading in
  // `item-name-plus-release-date`, while one retired long enough drops the
  // wrapper and leaves the <h1> bare. Anchoring here also keeps the match off
  // the other <h1>s on the page, the mailing-list block among them.
  const name = stripTags(
    html.match(/data-product-variant-item-number[\s\S]{0,400}?<h1[^>]*>([\s\S]{0,200}?)<\/h1>/)?.[1] ?? ""
  );
  if (!name) throw new Error(`No ball name found at ${url}`);

  const specs = html.match(/<section class="product-specifications">[\s\S]*?<\/section>/)?.[0] ?? html;
  const weights = parseWeights(html);
  const fifteen = weights.find((w) => w.weight === 15) ?? weights[0] ?? null;

  // The gallery's first slide is the ball front; the second is the core render,
  // so position matters here and `data-url` is what separates gallery slides
  // from the by-weight slides that share the class.
  const rel = html.match(/<li class="slide" data-url="([^"]+)"/)?.[1] ?? null;

  // Headings read "Predator V2 Asymmetric" and "Hadron Symmetrical"; the
  // suffix is a label for the core's shape, not part of its name.
  const core = specCell(specs, "Weight Block");

  // The cell as MOTIV writes it, with the type folded in only where the cell
  // itself leaves it out. A cover the build cannot classify is one the app
  // cannot filter, so the ball goes missing from the search that should find
  // it, and MOTIV state the type plainly enough elsewhere on the page.
  // The page's own copy first, then MOTIV's expansion of the acronym in the
  // cover's name. Both are MOTIV saying what the cover is; the page is
  // preferred only because it is talking about this ball in particular.
  const cover = specCell(specs, "Cover Stock");
  const coverType = cover && !/solid|pearl|hybrid|urethane/i.test(cover)
    ? statedCoverType(html) ?? acronymCoverType(cover)
    : null;

  return {
    brand: "Motiv",
    name,
    releaseDate: releaseDate(html),
    coverstockRaw: cover ? withCoverType(cover, coverType) : "Unknown",
    factoryFinish: specCell(specs, "Finish"),
    coreName: core ? core.replace(/\s+a?symmetric(al)?\s*$/i, "").trim() || null : null,
    rg: fifteen?.rg ?? null,
    diff: fifteen?.diff ?? null,
    mbDiff: fifteen?.mbDiff ?? null,
    sourceUrls: [url],
    // The page just read is MOTIV's own, so it is both where the specs came
    // from and the link their licence asks for.
    productUrl: url,
    weights: weights.length > 0 ? weights : undefined,
    _imageUrl: rel ? ORIGIN + rel.replace(/^\./, "") : null,
    _sku: stripTags(html.match(/data-product-variant-item-number[^>]*>([^<]*)</)?.[1] ?? "") || null,
    // MOTIV files a ball it no longer makes under its own category rather than
    // labelling the page, so the path is the signal.
    _discontinued: url.includes("/retired-balls/"),
  };
}

async function main(): Promise<void> {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error("Usage: npm run parse-motiv -- <page-url> [<page-url> ...]");
    process.exit(1);
  }

  const seed = seedPath();
  const staged: StagedBall[] = existsSync(seed) ? JSON.parse(readFileSync(seed, "utf-8")) : [];

  for (const url of urls) {
    const res = await fetch(url, { headers: { "user-agent": MOTIV_USER_AGENT } });
    if (!res.ok) {
      console.error(`✗ ${url}: HTTP ${res.status}`);
      continue;
    }
    // A page this cannot read costs that ball, not the run. Throwing here used
    // to abort before the write below, so a bad page nine balls in discarded
    // the eight good ones with it.
    let ball: StagedBall;
    try {
      ball = parsePage(await res.text(), url);
    } catch (e) {
      console.error(`✗ ${url}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const at = staged.findIndex((b) => b.brand === ball.brand && b.name === ball.name);
    if (at === -1) staged.push(ball);
    else staged[at] = ball;

    const weights = ball.weights?.map((w) => w.weight).join("/") ?? "-";
    console.log(
      `✓ ${ball.brand} ${ball.name}: ${ball.releaseDate ?? "no date"} | ${ball.coverstockRaw} | ` +
        `${ball.coreName ?? "no core"} | RG ${ball.rg ?? "-"} Diff ${ball.diff ?? "-"} MB ${ball.mbDiff ?? "-"} | ` +
        `${weights} lb | img ${ball._imageUrl ? "yes" : "NONE"}${ball._discontinued ? " | discontinued" : ""}`
    );
    // Courtesy rate-limit: this is someone else's server.
    await new Promise((r) => setTimeout(r, 1000));
  }

  mkdirSync(resolve(seed, ".."), { recursive: true });
  writeFileSync(seed, JSON.stringify(staged, null, 2) + "\n");
  console.log(`\n→ ${staged.length} staged in data/seed/motiv-seed.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
