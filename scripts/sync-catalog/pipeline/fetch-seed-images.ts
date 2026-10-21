/**
 * Fetch a photo for each catalog ball that has none, from the image URL its
 * parser recorded.
 *
 * Usage:
 *   npm run fetch-seed-images -- --brand Hammer [--limit 20] [--dry-run]
 *   npm run fetch-seed-images -- --all
 *   npm run fetch-seed-images -- --skip-ids <file> [--brand ...]   # only balls NOT listed
 *
 * `parse-bowwwl` and `parse-motiv` record each page's original image as
 * `_imageUrl` in data/seed/. This walks those staged entries, finds the ball in
 * balls.json, and for every ball with no entry in images.json downloads the
 * image, renders it through the normaliser (`renderBallPair`) and records it.
 * One request a second; a ball that already has a photo is never touched.
 *
 * Whose photos these are is a decision, not a default: ADR-039 limits third
 * party photos to balls the owner needs, and ADR-138 records the owner's call
 * to take them for the Brunswick family. Pass `--brand` or `--all` on purpose.
 * The normaliser cuts each photo to its ball (ADR-169), so a white card or a
 * drop shadow goes on the way in.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ballId } from "../normalize.js";
import type { RawBall } from "../types.js";
import { identityKey } from "./promote.js";
import { renderBallPair, type ImageEntry } from "./render.js";

type Staged = RawBall & { _imageUrl?: string | null };

/** The seed entries that name a ball in balls.json and carry an image URL. */
export function imageSources(balls: RawBall[], seeds: Staged[]): Map<string, { id: string; url: string; label: string }> {
  const byKey = new Map(balls.map((b) => [identityKey(b.brand, b.name), b]));
  const out = new Map<string, { id: string; url: string; label: string }>();
  for (const s of seeds) {
    if (!s._imageUrl) continue;
    const row = byKey.get(identityKey(s.brand, s.name));
    if (!row) continue;
    const id = ballId(row);
    if (!out.has(id)) out.set(id, { id, url: s._imageUrl, label: `${row.brand} ${row.name}` });
  }
  return out;
}

async function main(): Promise<void> {
  const SYNC = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const DATA = resolve(SYNC, "data");
  const IMG_DIR = resolve(SYNC, "../../public/catalog/img");
  const args = process.argv.slice(2);
  const brand = args.includes("--brand") ? args[args.indexOf("--brand") + 1] : null;
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
  const dryRun = args.includes("--dry-run");
  // A file of ids (one per line) to leave alone: "the balls added since then".
  const skip = new Set(
    args.includes("--skip-ids")
      ? readFileSync(args[args.indexOf("--skip-ids") + 1], "utf-8").split("\n").filter(Boolean)
      : []
  );
  if (!brand && !args.includes("--all") && !args.includes("--skip-ids")) {
    console.error("Usage: npm run fetch-seed-images -- (--brand <name> | --all) [--limit N] [--dry-run]");
    process.exit(1);
  }

  const balls: RawBall[] = JSON.parse(readFileSync(resolve(DATA, "balls.json"), "utf-8"));
  const imagesPath = resolve(DATA, "images.json");
  const images: Record<string, ImageEntry> = existsSync(imagesPath) ? JSON.parse(readFileSync(imagesPath, "utf-8")) : {};
  const denyPath = resolve(DATA, "image-denylist.json");
  const denied: string[] = existsSync(denyPath) ? JSON.parse(readFileSync(denyPath, "utf-8")) : [];

  const seeds: Staged[] = readdirSync(resolve(DATA, "seed"))
    .filter((f) => f.endsWith("-seed.json"))
    .flatMap((f) => JSON.parse(readFileSync(resolve(DATA, "seed", f), "utf-8")));
  const sources = imageSources(balls, seeds);

  const todo = balls
    .filter((b) => !brand || b.brand === brand)
    .map((b) => sources.get(ballId(b)))
    .filter(
      (s): s is { id: string; url: string; label: string } =>
        !!s && !images[s.id] && !denied.includes(s.id) && !skip.has(s.id)
    )
    .slice(0, limit);
  console.log(`${todo.length} balls with no photo and an image URL${brand ? ` (${brand})` : ""}.`);
  if (dryRun) {
    for (const t of todo) console.log(`  ${t.label}`);
    return;
  }

  let done = 0;
  const failed: string[] = [];
  for (const t of todo) {
    try {
      const res = await fetch(t.url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      images[t.id] = await renderBallPair(Buffer.from(await res.arrayBuffer()), t.id, IMG_DIR);
      done++;
      console.log(`✓ ${t.label}`);
    } catch (err) {
      failed.push(`${t.label}: ${(err as Error).message}`);
      console.log(`✗ ${t.label}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  writeFileSync(imagesPath, JSON.stringify(images, null, 2) + "\n");
  console.log(`\n${done} photos added, ${failed.length} failed. Run npm run contact-sheet and look at them in both themes.`);
}

if (process.argv[1] && process.argv[1].endsWith("fetch-seed-images.ts")) {
  await main();
}
