// PWA icon generator. Run: node scripts/generate-icons.mjs
//
// Draws a single bowling pin as real vector geometry on a felt background.
// It used to render the 🎳 emoji as text, which flattened to one cream fill,
// merged the ball into the pins and clipped both at the canvas edge: at 40px
// on a home screen it read as an indistinct blob rather than as anything to do
// with bowling.
//
// Output is committed to public/icons/ — re-run only when the mark changes.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const FELT = "#1b5148";
const CREAM = "#fff8ed";

// Pin profile in a 100x154 box: head, neck, shoulder, belly, base. Symmetric
// about x=50, drawn down the right side and back up the left.
const PIN_W = 100;
const PIN_H = 154;
const PIN_PATH = [
  "M 50 5",
  "C 57 5 63 11 63 20",
  "C 63 30 60 40 60 52",
  "C 60 64 63 70 67 80",
  "C 72 91 76 100 76 114",
  "C 76 130 71 143 65 149",
  "L 65 151",
  "L 35 151",
  "L 35 149",
  "C 29 143 24 130 24 114",
  "C 24 100 28 91 33 80",
  "C 37 70 40 64 40 52",
  "C 40 40 37 30 37 20",
  "C 37 11 43 5 50 5",
  "Z"
].join(" ");

/**
 * @param size    output pixel size
 * @param scale   pin height as a fraction of the canvas (safe zone control)
 * @param stripes whether to cut the two neck bands out of the pin
 */
function svg(size, scale, stripes) {
  const h = size * scale;
  const w = (h * PIN_W) / PIN_H;
  const x = (size - w) / 2;
  const y = (size - h) / 2;

  // The classic two bands. Cut in the background colour so the pin stays one
  // shape; at small sizes they read as a neck rather than as separate marks.
  const bands = stripes
    ? `<rect x="41" y="44" width="18" height="4.5" rx="2.25" fill="${FELT}"/>
       <rect x="41" y="53" width="18" height="4.5" rx="2.25" fill="${FELT}"/>`
    : "";

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${FELT}"/>
      <g transform="translate(${x} ${y}) scale(${w / PIN_W} ${h / PIN_H})">
        <path d="${PIN_PATH}" fill="${CREAM}"/>
        ${bands}
      </g>
    </svg>`
  );
}

async function render(name, size, scale, stripes = true) {
  const png = await sharp(svg(size, scale, stripes)).png().toBuffer();
  await writeFile(join(outDir, name), png);
  console.log("wrote", name);
}

await mkdir(outDir, { recursive: true });
await render("icon-192.png", 192, 0.74);
await render("icon-512.png", 512, 0.74);
// Maskable: the pin stays inside the Android safe zone (~60% centre), because
// a launcher may crop this to a circle.
await render("icon-512-maskable.png", 512, 0.56);
