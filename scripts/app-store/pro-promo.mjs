// The 1024 x 1024 promotional image for the Headpin Pro in-app purchase in App
// Store Connect (shown on the product page when the purchase is promoted, and
// in offer code redemptions). Run: node scripts/app-store/pro-promo.mjs
//
// Apple turns this image down when it is a screenshot from the app (Guideline
// 2.3.2), and the Pro mark drawn edge to edge counted as one, because the Pro
// page shows exactly that tile. So this is an illustration made only for the
// store: a lane seen from the foul line, the ball's line hooking into the
// pocket in Pro gold, and the rates Pro adds rising beside it. It carries no
// words, so it needs no translation, and no price, which Apple does not allow.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { PIN_H, PIN_PATH, PIN_W } from "../pin-mark.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "marketing", "app-store", "headpin-pro-promo-1024.png");

const GOLD = "#e9b949";
const CREAM = "#fff8ed";
const S = 1024;

// The lane in perspective: wide at the foul line (bottom), narrow at the deck.
const deckY = 300;
const laneTop = { l: 362, r: 662 };
const laneBottom = { l: 132, r: 892 };
const laneAt = (y) => {
  const t = (y - deckY) / (S - deckY);
  return {
    l: laneTop.l + (laneBottom.l - laneTop.l) * t,
    r: laneTop.r + (laneBottom.r - laneTop.r) * t
  };
};

// Boards: a faint line every few boards, converging on the deck.
const boards = Array.from({ length: 11 }, (_, i) => {
  const f = (i + 1) / 12;
  const x1 = laneTop.l + (laneTop.r - laneTop.l) * f;
  const x2 = laneBottom.l + (laneBottom.r - laneBottom.l) * f;
  return `<line x1="${x1}" y1="${deckY}" x2="${x2}" y2="${S}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>`;
}).join("");

// The arrows, seven of them, a third of the way down.
const arrows = [-3, -2, -1, 0, 1, 2, 3]
  .map((k) => {
    const y = 700 - Math.abs(k) * 22;
    const { l, r } = laneAt(y);
    const cx = (l + r) / 2 + ((r - l) / 12) * k * 1.5;
    const w = 14 * ((y - deckY) / (S - deckY) + 0.4);
    return `<path d="M ${cx} ${y - w * 1.6} L ${cx + w / 2} ${y} L ${cx - w / 2} ${y} Z" fill="#ffffff" fill-opacity="0.16"/>`;
  })
  .join("");

// Ten pins, back row first so the front ones overlap them.
const pin = (cx, baseY, h, head) => {
  const sc = h / PIN_H;
  const bands = head
    ? `<rect x="${(PIN_W - 22) / 2}" y="44" width="22" height="6" rx="3" fill="${GOLD}"/>` +
      `<rect x="${(PIN_W - 22) / 2}" y="54" width="22" height="6" rx="3" fill="${GOLD}"/>`
    : "";
  return `<g transform="translate(${cx - (PIN_W * sc) / 2} ${baseY - h}) scale(${sc})"><path d="${PIN_PATH}" fill="${CREAM}"/>${bands}</g>`;
};
const rows = [
  { y: 222, h: 54, xs: [-3, -1, 1, 3] },
  { y: 246, h: 60, xs: [-2, 0, 2] },
  { y: 270, h: 66, xs: [-1, 1] },
  { y: 296, h: 72, xs: [0] }
];
const pins = rows
  .map(({ y, h, xs }) => xs.map((k) => pin(512 + k * 34 * (h / 60), y, h, k === 0 && xs.length === 1)).join(""))
  .join("");

// The line: out toward the right, the breakpoint, and back into the 1-3 pocket.
const ball = { x: 600, y: 920, r: 62 };
const path = `M ${ball.x + 20} ${ball.y - 70} C 690 720 780 560 700 450 C 650 380 590 330 546 304`;

// Three rising rates on the left, in the Pro gold.
const bars = [
  { x: 120, h: 120, o: 0.45 },
  { x: 176, h: 190, o: 0.7 },
  { x: 232, h: 270, o: 1 }
]
  .map(
    ({ x, h, o }) =>
      `<rect x="${x}" y="${470 - h}" width="38" height="${h}" rx="10" fill="${GOLD}" fill-opacity="${o}"/>`
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27303d"/><stop offset="1" stop-color="#0f141b"/>
    </linearGradient>
    <linearGradient id="lane" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a4554"/><stop offset="1" stop-color="#232b36"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.55"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#f6d27a"/><stop offset="0.55" stop-color="${GOLD}"/><stop offset="1" stop-color="#a97a1c"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#ground)"/>
  <circle cx="512" cy="250" r="240" fill="url(#glow)"/>
  <path d="M ${laneTop.l} ${deckY} L ${laneTop.r} ${deckY} L ${laneBottom.r} ${S} L ${laneBottom.l} ${S} Z" fill="url(#lane)"/>
  ${boards}${arrows}
  <path d="${path}" fill="none" stroke="${GOLD}" stroke-width="16" stroke-linecap="round" stroke-dasharray="1 30" stroke-opacity="0.9"/>
  ${pins}
  ${bars}
  <circle cx="${ball.x}" cy="${ball.y}" r="${ball.r}" fill="url(#ball)"/>
  <g transform="rotate(-35 ${ball.x} ${ball.y})">
    <circle cx="${ball.x - 8}" cy="${ball.y - 34}" r="8" fill="#0f141b" fill-opacity="0.7"/>
    <circle cx="${ball.x + 18}" cy="${ball.y - 34}" r="8" fill="#0f141b" fill-opacity="0.7"/>
    <ellipse cx="${ball.x + 5}" cy="${ball.y + 2}" rx="8" ry="10" fill="#0f141b" fill-opacity="0.7"/>
  </g>
</svg>`;

await mkdir(dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).flatten({ background: "#0f141b" }).png().toFile(out);
console.log(out);
