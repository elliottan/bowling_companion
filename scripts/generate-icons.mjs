// One-off PWA icon generator. Run: node scripts/generate-icons.mjs
// Renders the 🎳 emoji on a felt-700 background into the PNG sizes the
// manifest needs. Output is committed to public/icons/ — re-run only when the
// brand color or glyph changes.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
const BG = "#1b5148"; // felt-700

/** Full-bleed icon: emoji fills most of the canvas. */
function svg(size, glyphRatio) {
  const fontSize = Math.round(size * glyphRatio);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${BG}"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
            font-size="${fontSize}" fill="#fff8ed">🎳</text>
    </svg>`
  );
}

async function render(name, size, glyphRatio) {
  const png = await sharp(svg(size, glyphRatio)).png().toBuffer();
  await writeFile(join(outDir, name), png);
  console.log("wrote", name);
}

await mkdir(outDir, { recursive: true });
await render("icon-192.png", 192, 0.72);
await render("icon-512.png", 512, 0.72);
// Maskable: glyph stays inside the Android safe zone (~60% center).
await render("icon-512-maskable.png", 512, 0.55);
