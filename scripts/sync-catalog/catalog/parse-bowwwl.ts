/**
 * Parse a ball spec page into a RawBall staging entry.
 *
 * Usage:
 *   npm run parse-bowwwl -- <page-url> [<page-url> ...]
 *
 * The source renders every spec as a labelled Drupal field
 * (`field--name-field-rg`, `field--name-field-core-specs`, …), so the whole
 * page parses off class names — no positional guessing, no model tokens. Each
 * parsed ball is appended to data/seed/bowwwl-seed.json for human review
 * before it is merged into balls.json (same staging flow as the PDF parsers).
 *
 * The `_imageUrl` field on each staged entry is the absolute URL of the
 * original (un-resized) product image; `add-ball-image` consumes it.
 *
 * TOKEN-SAFE: page HTML never enters a model context.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RawBall } from "../types.js";
import type { WeightSpec } from "../../../src/types/catalog.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");
const SEED = resolve(REPO_ROOT, "scripts/sync-catalog/data/seed/bowwwl-seed.json");

const ORIGIN = "https://www.bowwwl.com";

/** A staged ball carries the image URL alongside the RawBall fields. */
export type StagedBall = RawBall & { _imageUrl: string | null; _discontinued: boolean };

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Text of the *last* `field__item` inside the first `field--name-<name>` block.
 * Inline-label fields render as `<div field__label>RG</div><div
 * field__item>2.470</div>`, so taking the last item skips the label.
 */
function field(html: string, name: string): string | null {
  const start = html.indexOf(`field--name-${name} `);
  if (start === -1) return null;
  // Bounded window: a field block never runs longer than this, and stopping
  // early keeps a missing close-tag from swallowing the rest of the page.
  const window = html.slice(start, start + 4000);
  const items = [...window.matchAll(/<div class="field__item[^"]*">([\s\S]*?)<\/div>/g)];
  if (items.length === 0) return null;
  const text = stripTags(items[0][1]);
  return text.length > 0 ? text : null;
}

/**
 * ISO date from the `<time datetime="…">` attribute inside a named field.
 * The visible text is only ever "Mar 2022"; the attribute carries the real day,
 * so this reads the attribute and never reconstructs a date from display text.
 */
function fieldDate(html: string, name: string): string | null {
  const start = html.indexOf(`field--name-${name} `);
  if (start === -1) return null;
  const iso = html.slice(start, start + 600).match(/datetime="(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function num(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coverstock name + type, without repeating a word the name already carries.
 * The heading reads "MicroTrax Solid Coverstock" and the type reads "Particle
 * Reactive"; naively joining them yields "S70 Pearl Pearl Reactive". Dropping
 * type words already present reproduces the hand-curated convention in
 * balls.json ("S70 Pearl Reactive", "Controll Solid Urethane").
 */
function joinCoverstock(name: string | null, type: string | null): string {
  const nameWords = (name ?? "").replace(/\s*coverstock\s*$/i, "").trim().split(/\s+/).filter(Boolean);
  const seen = new Set(nameWords.map((w) => w.toLowerCase()));
  const extra = (type ?? "").split(/\s+/).filter((w) => w && !seen.has(w.toLowerCase()));
  return [...nameWords, ...extra].join(" ") || "Unknown";
}

/** Each weight is one `paragraph--type--core-specs` card titled "15 pounds". */
function parseWeights(html: string): WeightSpec[] {
  const cards = html.split('paragraph--type--core-specs').slice(1);
  const weights: WeightSpec[] = [];
  for (const card of cards) {
    const body = card.slice(0, 1600);
    const lb = body.match(/card-title[^>]*>\s*(\d+)\s*pounds?/i);
    if (!lb) continue;
    weights.push({
      weight: Number.parseInt(lb[1], 10),
      rg: num(field(body, "field-rg")),
      diff: num(field(body, "field-differential")),
      mbDiff: num(field(body, "field-mass-bias-differential")),
    });
  }
  return weights.sort((a, b) => b.weight - a.weight);
}

export function parsePage(html: string, url: string): StagedBall {
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? html;

  // "(various colors)" is a cataloguing note for balls sold in many colourways,
  // not part of the name printed on the ball.
  const name = stripTags(main.match(/field--name-title[^>]*>([\s\S]{0,300}?)<\/(?:h1|span|div)>/)?.[1] ?? "")
    .replace(/\s*\(various colors\)\s*$/i, "");
  if (!name) throw new Error(`No ball name found at ${url}`);

  // Brand comes from the URL path, not the page: the brand field renders as a
  // logo image with no reliable text node.
  const brandSlug = url.match(/bowling-ball-database\/([^/]+)\//)?.[1] ?? "";
  const brand = brandSlug
    .split("-")
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

  const weights = parseWeights(main);
  const fifteen = weights.find((w) => w.weight === 15) ?? weights[0] ?? null;

  // The original upload, not a derivative image style — the filename carries
  // Drupal's dedupe suffix (`…_0_0.png`) so it cannot be derived from the slug.
  const styled = main.match(/field--name-field-ball-image[\s\S]{0,900}?src="([^"]+\/balls\/[^"?]+)/)?.[1] ?? null;
  const imageUrl = styled
    ? ORIGIN + styled.replace(/\/styles\/[^/]+\/public\//, "/")
    : null;

  const coverType = field(main, "field-coverstock-type");
  const coverName = main.match(/field--name-field-coverstock [^"]*"[\s\S]{0,400}?<h5[^>]*>([\s\S]{0,120}?)<\/h5>/)?.[1];
  const coreHeading = main.match(/field--name-field-core [^"]*"[\s\S]{0,400}?<h5[^>]*>([\s\S]{0,120}?)<\/h5>/)?.[1];

  return {
    brand: brand as RawBall["brand"],
    name,
    releaseDate: fieldDate(main, "field-release-date"),
    coverstockRaw: joinCoverstock(coverName ? stripTags(coverName) : null, coverType),
    factoryFinish: field(main, "field-factory-finish"),
    // Headings read "Defiant LRG Core"; the suffix is a label, not the name.
    coreName: coreHeading
      ? stripTags(coreHeading).replace(/\s+core\s*$/i, "") || null
      : null,
    rg: fifteen?.rg ?? null,
    diff: fifteen?.diff ?? null,
    mbDiff: fifteen?.mbDiff ?? null,
    sourceUrls: [url],
    weights: weights.length > 0 ? weights : undefined,
    _imageUrl: imageUrl,
    // The div is always rendered — empty for a current ball, carrying a
    // "Discontinued" label otherwise. Presence alone is not the signal.
    _discontinued: /field--name-field-discontinued[^"]*"[^>]*>\s*<strong>/.test(main),
  };
}

async function main(): Promise<void> {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error("Usage: npm run parse-bowwwl -- <page-url> [<page-url> ...]");
    process.exit(1);
  }

  const staged: StagedBall[] = existsSync(SEED) ? JSON.parse(readFileSync(SEED, "utf-8")) : [];

  for (const url of urls) {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.error(`✗ ${url} — HTTP ${res.status}`);
      continue;
    }
    const ball = parsePage(await res.text(), url);
    const at = staged.findIndex((b) => b.brand === ball.brand && b.name === ball.name);
    if (at === -1) staged.push(ball);
    else staged[at] = ball;

    const weights = ball.weights?.map((w) => w.weight).join("/") ?? "—";
    console.log(
      `✓ ${ball.brand} ${ball.name} — ${ball.releaseDate ?? "no date"} | ${ball.coverstockRaw} | ` +
        `${ball.coreName ?? "no core"} | RG ${ball.rg ?? "—"} Diff ${ball.diff ?? "—"} MB ${ball.mbDiff ?? "—"} | ` +
        `${weights} lb | img ${ball._imageUrl ? "yes" : "NONE"}${ball._discontinued ? " | discontinued" : ""}`
    );
    // Courtesy rate-limit — this is someone else's server.
    await new Promise((r) => setTimeout(r, 1000));
  }

  mkdirSync(resolve(REPO_ROOT, "scripts/sync-catalog/data/seed"), { recursive: true });
  writeFileSync(SEED, JSON.stringify(staged, null, 2) + "\n");
  console.log(`\n→ ${staged.length} staged in data/seed/bowwwl-seed.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
