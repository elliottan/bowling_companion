/**
 * Give catalog balls a new photo from local files, safely.
 *
 * Usage:
 *   npm run set-ball-image -- <map.json>
 *
 * `map.json` is `{ "<ball-id>": "<path to a png/jpg/webp>" }`. For each ball
 * the file is rendered through the normaliser (`renderBallPair`) and recorded
 * in data/images.json, and two things are done that a plain overwrite would not:
 *
 *  1. The new files get a new name (`<id>-p2-thumb.webp`, then `-p3`). The app
 *     keeps a ball photo for 30 days keyed by its URL, so a replaced photo that
 *     kept its URL would only reach a phone once that ran out.
 *  2. The ball's previous file names are overwritten with the new image too. An
 *     arsenal ball keeps a snapshot of the path it was added with, and that path
 *     has to keep showing the right ball.
 *
 * A ball with no photo yet just gets its first one, under its plain name.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderBallPair, type ImageEntry } from "./render.js";

/** The file-name stem for a ball's next photo, given the one it has now. */
export function nextStem(id: string, current: string | undefined): string {
  const n = current?.match(/-p(\d+)-full\.webp$/)?.[1];
  if (n) return `${id}-p${Number(n) + 1}`;
  return current ? `${id}-p2` : id;
}

async function main(): Promise<void> {
  const SYNC = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const IMG_DIR = resolve(SYNC, "../../public/catalog/img");
  const imagesPath = resolve(SYNC, "data/images.json");
  const [mapFile] = process.argv.slice(2);
  if (!mapFile) {
    console.error("Usage: npm run set-ball-image -- <map.json>");
    process.exit(1);
  }
  const map: Record<string, string> = JSON.parse(readFileSync(mapFile, "utf-8"));
  const images: Record<string, ImageEntry> = existsSync(imagesPath) ? JSON.parse(readFileSync(imagesPath, "utf-8")) : {};

  let n = 0;
  for (const [id, file] of Object.entries(map)) {
    const old = images[id];
    const stem = nextStem(id, old?.imageFull);
    const entry = await renderBallPair(readFileSync(file), stem, IMG_DIR);
    if (old) {
      for (const k of ["imageThumb", "imageFull"] as const) {
        const oldFile = resolve(IMG_DIR, old[k].replace("/catalog/img/", ""));
        if (oldFile !== resolve(IMG_DIR, entry[k].replace("/catalog/img/", ""))) {
          copyFileSync(resolve(IMG_DIR, entry[k].replace("/catalog/img/", "")), oldFile);
        }
      }
    }
    images[id] = entry;
    n++;
  }
  writeFileSync(imagesPath, JSON.stringify(images, null, 2) + "\n");
  console.log(`${n} photos set. Run npm run sync-catalog, then look at them in both themes.`);
}

if (process.argv[1] && process.argv[1].endsWith("set-ball-image.ts")) {
  await main();
}
