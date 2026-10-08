// Guide link pages and cards. Run: npm run guide-pages
//
// A shared guide links to /guides/<id>, a small page that carries the guide's
// own title, summary and card for the preview a chat app draws under the link,
// then sends the visitor into the app (src/lib/guidePage.ts). This writes one
// page and one 1200x630 card per guide into public/guides/<id>/.
//
// Output is committed, like the icons and the screenshots, and a test holds the
// pages to the guides. Re-run when a guide's title or summary changes.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { BAND, CREAM, FELT, PIN_H, PIN_PATH, PIN_W } from "./pin-mark.mjs";
import { renderGuidePage } from "../src/lib/guidePage.ts";
import { GUIDES } from "../src/lib/guides.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const W = 1200;
const H = 630;
const FONT = "Inter, Helvetica, Arial, sans-serif";

const escapeXml = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Break a title into lines no wider than `max` characters, at spaces. A drawn
 *  card cannot wrap on its own. */
function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function cardSvg(guide) {
  const lines = wrap(guide.title, 24);
  if (lines.length > 3) throw new Error(`"${guide.title}" needs more than three lines on its card`);
  const size = lines.length > 2 ? 64 : 72;
  const lineHeight = size * 1.15;
  const textX = 150;
  // The block of title lines is centred on the card's middle, with the label
  // above it and the reading time below.
  const blockTop = (H - lines.length * lineHeight) / 2 + size * 0.85 + 10;
  const pinH = 150;
  const pinW = (pinH * PIN_W) / PIN_H;

  const title = lines
    .map(
      (l, i) =>
        `<text x="${textX}" y="${blockTop + i * lineHeight}" fill="${CREAM}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="-1.5">${escapeXml(l)}</text>`
    )
    .join("\n      ");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="${FELT}"/>
      <g transform="translate(${W - 150 - pinW} ${H - 70 - pinH}) scale(${pinW / PIN_W} ${pinH / PIN_H})" opacity="0.9">
        <path d="${PIN_PATH}" fill="${CREAM}"/>
        <rect x="41" y="44" width="18" height="5" rx="2.5" fill="${BAND}"/>
        <rect x="41" y="53" width="18" height="5" rx="2.5" fill="${BAND}"/>
      </g>
      <text x="${textX}" y="${blockTop - size * 0.85 - 40}" fill="${CREAM}" fill-opacity="0.7" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="3">HEADPIN GUIDE</text>
      ${title}
      <text x="${textX}" y="${blockTop + (lines.length - 1) * lineHeight + 70}" fill="${CREAM}" fill-opacity="0.7" font-family="${FONT}" font-size="30">${escapeXml(`${guide.topic} · ${guide.minutes} min read`)}</text>
    </svg>`
  );
}

// A guide that was removed must not keep answering its old link.
const guidesDir = join(root, "public", "guides");
const wanted = new Set(GUIDES.map((g) => g.id));
for (const entry of await readdir(guidesDir, { withFileTypes: true }).catch(() => [])) {
  if (entry.isDirectory() && !wanted.has(entry.name)) {
    await rm(join(guidesDir, entry.name), { recursive: true });
    console.log("removed", `guides/${entry.name}/`);
  }
}

for (const guide of GUIDES) {
  const dir = join(root, "public", "guides", guide.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), renderGuidePage(guide));
  await writeFile(join(dir, "card.png"), await sharp(cardSvg(guide)).png().toBuffer());
  console.log("wrote", `guides/${guide.id}/`);
}
