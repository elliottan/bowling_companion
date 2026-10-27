// The 1024 x 1024 picture for the Headpin Pro in-app purchase in App Store
// Connect. Run: node scripts/app-store/pro-icon.mjs
//
// The Pro mark (src/components/ui/ProMark.tsx, ADR-167) drawn edge to edge: the
// store rounds the corners itself and takes no transparency, so the tile is a
// plain square and the hairline of gold is left out.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { PIN_H, PIN_PATH, PIN_W } from "../pin-mark.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "marketing", "app-store", "headpin-pro-1024.png");

const GOLD = "#e9b949";
const CREAM = "#fff8ed";
const SIZE = 1024;
const pinH = SIZE * 0.58;
const scale = pinH / PIN_H;
const x = (SIZE - PIN_W * scale) / 2;
const y = SIZE * 0.08;
// The bands sit at 44 and 53 of the mark's 154 high pin, and are 18 wide.
const band = (top) =>
  `<rect x="${(PIN_W - 18) / 2}" y="${top}" width="18" height="5" rx="2.5" fill="${GOLD}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27303d"/><stop offset="1" stop-color="#0f141b"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
    <path d="${PIN_PATH}" fill="${CREAM}"/>
    ${band(44)}${band(53)}
  </g>
  <text x="${SIZE / 2}" y="${SIZE * 0.88}" text-anchor="middle" fill="${GOLD}"
    font-family="Helvetica, Arial, sans-serif" font-size="${SIZE * 0.17}" font-weight="800"
    letter-spacing="${SIZE * 0.035}"><tspan dx="${SIZE * 0.0175}">PRO</tspan></text>
</svg>`;

await mkdir(dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).flatten({ background: "#0f141b" }).png().toFile(out);
console.log(out);
