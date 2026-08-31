/**
 * The picture a bowler posts after a good night.
 *
 * Drawn on a canvas rather than screenshotted from the DOM. A screenshot of
 * the running app carries its nav bar, its scroll position and whichever theme
 * the user happens to be in, which is the wrong artefact to hand a feed. A
 * drawn card is a fixed size, always legible, and always carries the app's
 * name, which is the only reason a share is worth building at all.
 *
 * The card is felt green in both themes on purpose. `felt` and `lane` are
 * brand identity rather than theme-dependent surfaces (see tailwind.config.js),
 * and a card that changed colour depending on the sharer's theme would read as
 * two different products.
 */

/** Brand colours, static. Mirrors the felt/lane values in tailwind.config.js. */
const FELT = "#1b5148";
const CREAM = "#fff8ed";
const CREAM_DIM = "rgba(255, 248, 237, 0.62)";

const W = 1080;
const H = 1350;
const PAD = 84;

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export interface ShareStat {
  value: string;
  label: string;
}

export interface ShareCardData {
  /** Small line above the title: the date, the event, the sample size. */
  eyebrow: string;
  title: string;
  /** The one number the card is about. */
  hero: ShareStat | null;
  /** Game scores, drawn as scoresheet boxes. Null on a card that is not a night. */
  games: string[] | null;
  /** Supporting numbers, two per row. Four rows deep is the cap, and a card
   *  with game boxes only has room for two. */
  stats: ShareStat[];
}

/* ------------------------------------------------------------------ *
 * Builders. Pure, so they carry the tests: the canvas below cannot be
 * meaningfully asserted on in jsdom.
 * ------------------------------------------------------------------ */

interface SessionLike {
  alleyName: string;
  /** The session description: League, Practice, a tournament name. */
  event?: string;
  date: string;
  /** Every game's score, finished or running. */
  scores: number[];
  /** Of those, the ones that are final. An unfinished game must not drag the
   *  average down, matching how the session header computes it. */
  finalScores: number[];
  strikePct: number | null;
  sparePct: number | null;
}

/** Formats a stored session date for the card. Falls back to the raw string,
 *  because `date` is user-editable free text and may not parse. */
export function formatCardDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function pct(value: number | null): string | null {
  return value === null ? null : `${Math.round(value)}%`;
}

export function buildSessionCard(session: SessionLike): ShareCardData {
  const total = session.scores.reduce((sum, s) => sum + s, 0);
  const avg = session.finalScores.length
    ? Math.round(session.finalScores.reduce((a, b) => a + b, 0) / session.finalScores.length)
    : null;
  const high = session.finalScores.length ? Math.max(...session.finalScores) : null;

  const stats: ShareStat[] = [];
  if (avg !== null) stats.push({ value: String(avg), label: "Average" });
  if (high !== null) stats.push({ value: String(high), label: "High game" });
  const strikes = pct(session.strikePct);
  if (strikes) stats.push({ value: strikes, label: "Strikes" });
  const spares = pct(session.sparePct);
  if (spares) stats.push({ value: spares, label: "Spares" });

  const eyebrow = [session.event?.trim(), formatCardDate(session.date)]
    .filter(Boolean)
    .join("  ·  ");

  return {
    eyebrow,
    title: session.alleyName || "Bowling",
    hero: { value: String(total), label: session.scores.length === 1 ? "Game" : "Series" },
    games: session.scores.map(String),
    stats
  };
}

interface StatsLike {
  totalSessions: number;
  completedGames: number;
  averageScore: number | null;
  highGame: number | null;
  strikePct: number | null;
  sparePct: number | null;
  pocketPct: number | null;
  carryPct: number | null;
}

export function buildStatsCard(stats: StatsLike, filterLabel: string): ShareCardData {
  const supporting: ShareStat[] = [];
  if (stats.highGame !== null) supporting.push({ value: String(stats.highGame), label: "High game" });
  const strikes = pct(stats.strikePct);
  if (strikes) supporting.push({ value: strikes, label: "Strikes" });
  const spares = pct(stats.sparePct);
  if (spares) supporting.push({ value: spares, label: "Spares" });
  const pocket = pct(stats.pocketPct);
  if (pocket) supporting.push({ value: pocket, label: "Pocket" });
  const carry = pct(stats.carryPct);
  if (carry) supporting.push({ value: carry, label: "Carry" });

  const sessionWord = stats.totalSessions === 1 ? "session" : "sessions";
  const gameWord = stats.completedGames === 1 ? "game" : "games";

  return {
    eyebrow: `${stats.totalSessions} ${sessionWord}  ·  ${stats.completedGames} ${gameWord}`,
    title: filterLabel,
    hero:
      stats.averageScore === null
        ? null
        : { value: String(Math.round(stats.averageScore)), label: "Average" },
    games: null,
    // Three rows fit where the game boxes would have been.
    stats: supporting.slice(0, 6)
  };
}

interface FilterParts {
  alley: string;
  pattern: string;
  event: string;
  gameNumber: number | null;
  lanes: string[];
}

/**
 * What the numbers on a stats card are actually about. Named parts only: an
 * unfiltered card says so rather than pretending to a scope it does not have.
 */
export function describeFilter(parts: FilterParts): string {
  const named = [parts.alley, parts.pattern, parts.event].filter((p) => p.trim() !== "");
  if (parts.gameNumber !== null) named.push(`Game ${parts.gameNumber}`);
  if (parts.lanes.length > 0) {
    named.push(`${parts.lanes.length === 1 ? "Lane" : "Lanes"} ${parts.lanes.join(", ")}`);
  }
  return named.length === 0 ? "Every session" : named.join("  ·  ");
}

/** Filename for the saved image. Minutes included so two shares in one day do
 *  not collide in a folder as "(1)" and "(2)", the way backups used to. */
export function shareCardFilename(title: string, now = new Date()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `${slug || "bowling"}-${stamp}.png`;
}

/* ------------------------------------------------------------------ *
 * Canvas rendering.
 * ------------------------------------------------------------------ */

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

/** Draws text, shrinking it until it fits rather than letting it run off the
 *  card. Alley names and filter summaries are user text and can be long. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  size: number
): void {
  let s = size;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxWidth && s > 24) {
    s -= 4;
    ctx.font = font(weight, s);
  }
  // Still too long at the floor: clip with an ellipsis.
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    out = `${out}…`;
  }
  ctx.fillText(out, x, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

/** Renders the card and hands back a PNG. Rejects when the browser gives us no
 *  2D context, which is the only failure this can have. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the share image.");

  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, W, H);

  // A lane-shaped band behind the hero, so the card has depth without needing
  // an image to load.
  ctx.fillStyle = "rgba(255, 248, 237, 0.045)";
  ctx.fillRect(0, 296, W, 308);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Eyebrow
  ctx.fillStyle = CREAM_DIM;
  ctx.font = font(600, 30);
  ctx.fillText(data.eyebrow.toUpperCase(), PAD, 148);

  // Title
  ctx.fillStyle = CREAM;
  fitText(ctx, data.title, PAD, 244, W - PAD * 2, 800, 78);

  // Hero. Shrunk to fit like the title: a six-game series runs to four digits.
  if (data.hero) {
    ctx.fillStyle = CREAM;
    fitText(ctx, data.hero.value, PAD, 552, W - PAD * 2 - 240, 800, 210);
    const heroWidth = ctx.measureText(data.hero.value).width;
    ctx.fillStyle = CREAM_DIM;
    ctx.font = font(600, 34);
    ctx.fillText(data.hero.label.toUpperCase(), PAD + heroWidth + 24, 552);
  }

  // Game boxes, drawn like the app's own scorecard.
  const hasGames = Boolean(data.games && data.games.length > 0);
  if (data.games && hasGames) {
    const gap = 16;
    const count = Math.min(data.games.length, 6);
    const boxW = (W - PAD * 2 - gap * (count - 1)) / count;
    const boxH = 130;
    const boxY = 664;
    for (let i = 0; i < count; i++) {
      const x = PAD + i * (boxW + gap);
      ctx.fillStyle = "rgba(255, 248, 237, 0.08)";
      roundRect(ctx, x, boxY, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 248, 237, 0.16)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = CREAM_DIM;
      ctx.font = font(600, 24);
      ctx.fillText(`G${i + 1}`, x + boxW / 2, boxY + 44);
      ctx.fillStyle = CREAM;
      ctx.font = font(700, 54);
      // Shrinks only if six four-digit scores ever share a row.
      fitText(ctx, data.games[i], x + boxW / 2, boxY + 104, boxW - 16, 700, 54);
      ctx.textAlign = "left";
    }
  }

  // Supporting stats, two per row. A session card has game boxes above it and
  // room for two rows; a stats card has neither and takes three, which is why
  // the start moves rather than the spacing.
  const shown = data.stats.slice(0, hasGames ? 4 : 6);
  const statsY = hasGames ? 872 : 700;
  const colW = (W - PAD * 2) / 2;
  shown.forEach((stat, i) => {
    const x = PAD + (i % 2) * colW;
    const rowY = statsY + Math.floor(i / 2) * 126;
    ctx.fillStyle = CREAM;
    ctx.font = font(700, 66);
    ctx.fillText(stat.value, x, rowY + 60);
    ctx.fillStyle = CREAM_DIM;
    ctx.font = font(600, 26);
    ctx.fillText(stat.label.toUpperCase(), x, rowY + 98);
  });

  // Footer wordmark. The entire reason a share is worth building, so it is
  // cream rather than the brand green, which on this ground is barely legible.
  ctx.fillStyle = "rgba(255, 248, 237, 0.16)";
  ctx.fillRect(PAD, 1200, W - PAD * 2, 2);
  ctx.fillStyle = CREAM;
  ctx.font = font(800, 34);
  ctx.fillText("Bowling Companion", PAD, 1264);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The share image could not be created."));
    }, "image/png");
  });
}

/* ------------------------------------------------------------------ *
 * Getting it off the device.
 * ------------------------------------------------------------------ */

export type ShareDestination = "shared" | "downloaded" | "cancelled";

/** Whether this browser will hand an image to the OS share sheet. Checked on
 *  the file itself: Safari advertises `share` while refusing some files. */
export function canShareImage(file: File, nav: Navigator = navigator): boolean {
  return typeof nav.canShare === "function" && nav.canShare({ files: [file] });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Share sheet where there is one, download where there is not.
 *
 * Deliberately separate from `shareBackup`: that one records the backup,
 * distinguishes a cancelled share from a completed one for the nudge, and
 * carries JSON. This one just moves a picture.
 */
export async function shareCardImage(blob: Blob, filename: string): Promise<ShareDestination> {
  const file = new File([blob], filename, { type: "image/png" });

  if (canShareImage(file)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // Closing the sheet is not a failure and must not fall through to a
      // download the user did not ask for.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      download(blob, filename);
      return "downloaded";
    }
  }

  download(blob, filename);
  return "downloaded";
}
