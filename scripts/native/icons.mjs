// The store apps' icons and launch screens. Run: node scripts/native/icons.mjs
//
// The same pin on felt as the web app's icons (scripts/generate-icons.mjs,
// scripts/pin-mark.mjs), drawn at the sizes Xcode and Android Studio ask for.
// It replaces Capacitor's placeholder mark, which App Review rejects on sight.
//
// Output is committed under ios/ and android/. Re-run only when the mark changes.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { BAND, CREAM, FELT, PIN_H, PIN_PATH, PIN_W } from "../pin-mark.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ios = join(root, "ios", "App", "App", "Assets.xcassets");
const res = join(root, "android", "app", "src", "main", "res");

/**
 * The pin, centred on a canvas.
 * @param w, h     canvas size in pixels
 * @param scale    pin height as a fraction of the shorter side
 * @param shape    "square", "circle", or "none" for the pin on transparency
 */
function svg(w, h, scale, shape = "square") {
  const side = Math.min(w, h);
  const ph = side * scale;
  const pw = (ph * PIN_W) / PIN_H;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2;
  const ground =
    shape === "square"
      ? `<rect width="${w}" height="${h}" fill="${FELT}"/>`
      : shape === "circle"
        ? `<circle cx="${w / 2}" cy="${h / 2}" r="${side / 2}" fill="${FELT}"/>`
        : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${ground}
      <g transform="translate(${x} ${y}) scale(${pw / PIN_W} ${ph / PIN_H})">
        <path d="${PIN_PATH}" fill="${CREAM}"/>
        <rect x="41" y="44" width="18" height="5" rx="2.5" fill="${BAND}"/>
        <rect x="41" y="53" width="18" height="5" rx="2.5" fill="${BAND}"/>
      </g>
    </svg>`
  );
}

async function png(path, w, h, scale, shape, { opaque = false } = {}) {
  let image = sharp(svg(w, h, scale, shape));
  // App Store Connect refuses an app icon with an alpha channel.
  if (opaque) image = image.flatten({ background: FELT }).removeAlpha();
  await writeFile(path, await image.png().toBuffer());
  console.log("wrote", path.slice(root.length + 1));
}

// iOS: one 1024 icon, which the system masks to its own corner shape, so the
// pin keeps clear of where the corners cut.
await png(join(ios, "AppIcon.appiconset", "AppIcon-512@2x.png"), 1024, 1024, 0.66, "square", { opaque: true });

// The launch screen fills the screen with this square (scaleAspectFill), so the
// pin stays small and centred whatever the phone's shape.
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await png(join(ios, "Splash.imageset", name), 2732, 2732, 0.12, "square", { opaque: true });
}

// Android launcher icons, legacy and round, at each density's 48dp.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const px = Math.round(48 * k);
  await png(join(res, `mipmap-${d}`, "ic_launcher.png"), px, px, 0.7, "square");
  await png(join(res, `mipmap-${d}`, "ic_launcher_round.png"), px, px, 0.6, "circle");
  // The adaptive icon's foreground: 108dp, of which a launcher may show only
  // the middle 66dp, so the pin sits well inside it on transparency.
  const fg = Math.round(108 * k);
  await png(join(res, `mipmap-${d}`, "ic_launcher_foreground.png"), fg, fg, 0.42, "none");
}

// Android splash images, portrait and landscape, at each density.
const splash = {
  "drawable": [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280]
};
for (const [dir, [w, h]] of Object.entries(splash)) {
  await png(join(res, dir, "splash.png"), w, h, 0.3, "square", { opaque: true });
}

// The adaptive icon's background is the felt.
await writeFile(
  join(res, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${FELT}</color>\n</resources>\n`
);
console.log("wrote android/app/src/main/res/values/ic_launcher_background.xml");
