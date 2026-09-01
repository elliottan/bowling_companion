// PWA icon generator. Run: node scripts/generate-icons.mjs
//
// Draws a single bowling pin as real vector geometry on a felt background.
// It used to render the 🎳 emoji as text, which flattened to one cream fill,
// merged the ball into the pins and clipped both at the canvas edge: at 40px
// on a home screen it read as an indistinct blob rather than as anything to do
// with bowling.
//
// Also draws the 1200x630 social share card (public/og-image.png), so the mark
// and the card can never drift apart.
//
// Output is committed to public/. Re-run only when the mark changes.
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

// Search-result and browser-tab favicons. Google reads the <link rel="icon">
// on the page and wants a square whose side is a multiple of 48, so these are
// 48 and 96 rather than the 32 a tab alone would need. The neck bands are
// dropped below 48px: two 4.5-unit stripes on a 32px canvas are under half a
// pixel each, and they smear the neck into a grey band instead of reading as
// bands.
await render("icon-48.png", 48, 0.74);
await render("icon-96.png", 96, 0.74);

/**
 * favicon.ico, at the root, because browsers ask for it whether or not a page
 * links one and a 404 on every visit is a needless miss. ICO is a container:
 * a directory of images, each of which may itself be a PNG, so the sizes below
 * are the same renders the rest of this script produces.
 */
async function icoEntry(size, stripes) {
  return { size, png: await sharp(svg(size, 0.74, stripes)).png().toBuffer() };
}

const icoImages = [await icoEntry(16, false), await icoEntry(32, false), await icoEntry(48, true)];
const HEADER = 6;
const ENTRY = 16;
const header = Buffer.alloc(HEADER);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(icoImages.length, 4);

let offset = HEADER + ENTRY * icoImages.length;
const dir = [];
for (const { size, png } of icoImages) {
  const e = Buffer.alloc(ENTRY);
  e.writeUInt8(size, 0); // width  (0 would mean 256)
  e.writeUInt8(size, 1); // height
  e.writeUInt8(0, 2); // palette size: 0 for truecolour
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  dir.push(e);
}

await writeFile(
  join(root, "public", "favicon.ico"),
  Buffer.concat([header, ...dir, ...icoImages.map((i) => i.png)])
);
console.log("wrote favicon.ico");

// Social share card. 1200x630 is the size Facebook, Twitter/X, Slack, Discord
// and iMessage all crop from, so a link pasted anywhere shows the mark and the
// one line that says what this is.
function ogSvg() {
  const W = 1200;
  const H = 630;
  const h = 380;
  const w = (h * PIN_W) / PIN_H;
  const x = 150;
  const y = (H - h) / 2;
  const textX = x + w + 90;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="${FELT}"/>
      <g transform="translate(${x} ${y}) scale(${w / PIN_W} ${h / PIN_H})">
        <path d="${PIN_PATH}" fill="${CREAM}"/>
        <rect x="41" y="44" width="18" height="4.5" rx="2.25" fill="${FELT}"/>
        <rect x="41" y="53" width="18" height="4.5" rx="2.25" fill="${FELT}"/>
      </g>
      <text x="${textX}" y="290" fill="${CREAM}" font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="700" letter-spacing="-2">Headpin</text>
      <text x="${textX}" y="356" fill="${CREAM}" fill-opacity="0.75" font-family="Helvetica, Arial, sans-serif" font-size="40">Offline bowling score keeper</text>
      <text x="${textX}" y="416" fill="${CREAM}" fill-opacity="0.55" font-family="Helvetica, Arial, sans-serif" font-size="32">Free. No account. Works on the lane.</text>
    </svg>`
  );
}

const ogPng = await sharp(ogSvg()).png().toBuffer();
await writeFile(join(root, "public", "og-image.png"), ogPng);
console.log("wrote og-image.png");
