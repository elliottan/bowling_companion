/**
 * Turns the web build (`dist/`) into what the store app carries (`dist-native/`),
 * which Capacitor then copies into the iOS project (ADR-155).
 *
 * Run by `npm run build:ios`, after `vite build`. The app is the same build as
 * the web app; what differs is which files go in:
 *
 * - The app shell becomes the root page. Capacitor opens `index.html`, which on
 *   the site is the landing page, a pitch for the app the bowler already has.
 * - Ball photos and pattern sheets stay out (ADR-154): about 110 MB the app
 *   fetches from headpin.app when a screen needs one, so a takedown stays a
 *   server edit. `catalog.json` and `patterns.json` go in, as the snapshot a
 *   fresh install works from offline.
 * - What only the website uses stays out: the service worker (the iOS web view
 *   runs none for the app's own scheme), the install manifests, the guide link
 *   pages and their cards, the landing page's screenshots, the crawler files.
 * - Vercel's page analytics script is taken out of the shell. Inside the app it
 *   could only fail, and the app's privacy label is written without it.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** Paths under `dist/`, with `/` separators, that the app does not carry. */
const LEFT_OUT: readonly RegExp[] = [
  /^index\.html$/, // the landing page; the shell takes its place
  /^score\//, // the shell, moved to the root
  /^404\.html$/,
  /^catalog\/img\//,
  /^catalog\/sheets\//,
  /^guides\//,
  /^shots\//,
  /^sw\.js$/,
  /^workbox-[^/]+\.js$/,
  /^[^/]+\.webmanifest$/,
  /^og-image\.png$/,
  /^robots\.txt$/,
  /^sitemap\.xml$/
];

export function keepInApp(path: string): boolean {
  return !LEFT_OUT.some((rule) => rule.test(path));
}

const VERCEL_INSIGHTS = /[ \t]*<script\b[^>]*\bsrc="\/_vercel\/insights\/script\.js"[^>]*><\/script>\n?/;
const MANIFEST_LINK = /[ \t]*<link\b[^>]*\brel="manifest"[^>]*>\n?/;

/** The shell page as the app opens it. Fails loudly if the analytics tag it
 *  exists to remove has moved, rather than shipping it quietly. */
export function appShellHtml(html: string): string {
  if (!VERCEL_INSIGHTS.test(html)) {
    throw new Error("The app shell has no Vercel analytics tag to take out: update scripts/native/assemble.ts");
  }
  return html.replace(VERCEL_INSIGHTS, "").replace(MANIFEST_LINK, "");
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

export function assemble(from: string, to: string): { files: number; bytes: number } {
  rmSync(to, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const file of filesUnder(from)) {
    const path = relative(from, file).split(sep).join("/");
    if (!keepInApp(path)) continue;
    const target = join(to, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    files++;
    bytes += statSync(file).size;
  }
  const shell = appShellHtml(readFileSync(join(from, "score", "index.html"), "utf8"));
  writeFileSync(join(to, "index.html"), shell);
  return { files: files + 1, bytes: bytes + Buffer.byteLength(shell) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) {
  const { files, bytes } = assemble("dist", "dist-native");
  console.log(`dist-native: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
