/**
 * Re-render catalog photos through the current normaliser, from the photos
 * already in the repo.
 *
 * Usage:
 *   npm run rerender-images -- --all [--dry-run]
 *   npm run rerender-images -- <ball-id> [<ball-id>…]
 *
 * The original downloads are not kept, so a ball's current `-full.webp` is the
 * source. Only entries rendered by an older `NORMALISER` are taken: a photo
 * that already had this treatment would lose another `RIM_INSET` of its rim
 * and take the edge shade twice.
 *
 * Each re-rendered photo gets a new file name (`nextStem`), because the app
 * keeps a ball photo by its URL, for 30 days in the service worker and until
 * evicted on the iPhone (ADR-131, ADR-162). The old thumb name is overwritten
 * with the new thumb, since an arsenal ball's snapshot holds that path until
 * its next catalog sync (ADR-143). The old full is removed: only the catalog
 * itself names a full, and it names the new one.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NORMALISER, renderBallPair, type ImageEntry } from "./render.js";
import { nextStem } from "./set-ball-image.js";

/** The entries a run takes: those named (or all), not yet at `NORMALISER`. */
export function staleEntries(images: Record<string, ImageEntry>, ids: string[] | "all"): string[] {
  const named = ids === "all" ? Object.keys(images) : ids.filter((id) => images[id]);
  return named.filter((id) => (images[id].normaliser ?? 1) < NORMALISER);
}

async function main(): Promise<void> {
  const SYNC = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const IMG_DIR = resolve(SYNC, "../../public/catalog/img");
  const imagesPath = resolve(SYNC, "data/images.json");
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith("--"));
  if (!args.includes("--all") && ids.length === 0) {
    console.error("Usage: npm run rerender-images -- (--all | <ball-id>…) [--dry-run]");
    process.exit(1);
  }
  const images: Record<string, ImageEntry> = JSON.parse(readFileSync(imagesPath, "utf-8"));
  const file = (webPath: string) => resolve(IMG_DIR, webPath.replace("/catalog/img/", ""));
  const todo = staleEntries(images, args.includes("--all") ? "all" : ids);
  console.log(`${todo.length} photos to re-render.`);
  if (args.includes("--dry-run")) return;

  const failed: string[] = [];
  for (const [n, id] of todo.entries()) {
    const old = images[id];
    try {
      const entry = await renderBallPair(readFileSync(file(old.imageFull)), nextStem(id, old.imageFull), IMG_DIR);
      copyFileSync(file(entry.imageThumb), file(old.imageThumb));
      if (existsSync(file(old.imageFull))) rmSync(file(old.imageFull));
      images[id] = entry;
    } catch (err) {
      failed.push(id);
      console.log(`✗ ${id}: ${(err as Error).message}`);
    }
    // Saved as it goes, so a run stopped halfway can be picked up again: the
    // entries done are at the current normaliser and are skipped.
    if (n % 25 === 24 || n === todo.length - 1) {
      writeFileSync(imagesPath, JSON.stringify(images, null, 2) + "\n");
      console.log(`  ${n + 1} of ${todo.length}`);
    }
  }
  console.log(`\n${todo.length - failed.length} re-rendered, ${failed.length} failed.`);
  console.log("Run npm run sync-catalog, then npm run contact-sheet and look at them in both themes.");
}

if (process.argv[1] && process.argv[1].endsWith("rerender-images.ts")) {
  await main();
}
