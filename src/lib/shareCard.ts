import { plural, t } from "@lingui/core/macro";
import { formatSessionDate } from "./dates";
import { formatNumber, formatPercent } from "./format";
import { POCKET_BOARD, buildLinePath, xToBoard, yToFeet } from "./laneGeometry";
import { oilBands, oilExitPoint, oilStats, oilZones, peakUnits, toHandBoard, type OilBand } from "./oilPattern";
import { shareFileFromApp } from "./nativeShare";
import { formatLeave } from "./pins";
import { isNativeApp } from "./platform";
import { PIN_POSITIONS } from "./pinGeometry";
import type { Handedness, LineSpec, OilPass, PinNumber } from "../types/bowling";
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
/** The ball's path on a line card, and the oil it travels through. */
const PATH_INK = "#f5b041";
const OIL_INK = "120, 190, 255";
const OIL_DOT = `rgb(${OIL_INK})`;

const W = 1080;
const H = 1350;
const PAD = 84;

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export interface ShareStat {
  value: string;
  label: string;
  /** A dot drawn before the label, in the colour of the mark it names on the
   *  card's picture. Only a line card has marks to name. */
  swatch?: string;
}

export interface ShareCardData {
  /** Small line above the title: the date, the event, the sample size. */
  eyebrow: string;
  title: string;
  /** A sentence under the title, wrapped over at most two lines. What the
   *  numbers above mean, where they have a meaning worth a sentence. */
  caption?: string;
  /** The one number the card is about. */
  hero: ShareStat | null;
  /** Game scores, drawn as scoresheet boxes. Null on a card that is not a night. */
  games: string[] | null;
  /** Supporting numbers, two per row. Four rows deep is the cap, and a card
   *  with game boxes only has room for two. */
  stats: ShareStat[];
  /** A picture to put where the hero and the game boxes would go: the ball,
   *  with the layout on it. Square, and passed in already rasterized, because
   *  turning the app's own SVG into an image is the view layer's job. */
  diagram?: CanvasImageSource;
  /** The app mark, drawn beside the footer wordmark. Passed in rather than
   *  loaded here: fetching an image is the view layer's job, and a card that
   *  could not get one is still a card, so it is optional and the wordmark
   *  simply sits where it always did. */
  mark?: CanvasImageSource;
  /** A lane drawn down the left of the card, with the stats stacked beside
   *  it rather than under it. A line card's picture. */
  lane?: ShareLane;
  /** Short bars drawn in a small block under a layout card's ball: what the
   *  ball will do, the same four readings the lab's rail shows. */
  meters?: ShareMeter[];
  /** The title is a layout reading, so its " x " separators are drawn dim and
   *  its fractions a step down, and the numbers carry it (as `LayoutNumbers`
   *  does on screen). */
  readingTitle?: boolean;
}

export interface ShareMeter {
  label: string;
  /** 0 to 1 along the bar. */
  value: number;
  /** The reading in a word, drawn at the bar's end. */
  word: string;
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

/** Formats a stored session date for the card. One formatter for every place
 *  a session day is shown (`lib/dates.ts`). */
export function formatCardDate(date: string): string {
  return formatSessionDate(date);
}

function pct(value: number | null): string | null {
  return value === null ? null : formatPercent(Math.round(value));
}

export function buildSessionCard(session: SessionLike): ShareCardData {
  const total = session.scores.reduce((sum, s) => sum + s, 0);
  const avg = session.finalScores.length
    ? Math.round(session.finalScores.reduce((a, b) => a + b, 0) / session.finalScores.length)
    : null;
  const high = session.finalScores.length ? Math.max(...session.finalScores) : null;
  const count = session.scores.length;

  // The average leads: it is the number a night is compared by, where a series
  // mostly says how many games were bowled. One game is its own score, and a
  // night with no finished game has no average yet, so both lead with the total.
  const single = count === 1;
  const leadsWithAverage = !single && avg !== null;
  const hero: ShareStat = leadsWithAverage
    ? { value: String(avg), label: t`Average` }
    : { value: String(total), label: single ? t`Game` : t`Series` };

  const stats: ShareStat[] = [];
  if (leadsWithAverage) {
    stats.push({
      value: String(total),
      label: plural(count, { one: "# game series", other: "# game series" })
    });
  }
  if (!single && high !== null) stats.push({ value: String(high), label: t`High game` });
  const strikes = pct(session.strikePct);
  if (strikes) stats.push({ value: strikes, label: t({ message: "Strikes", comment: "Bowling term: a card stat, the share of first balls that knocked all ten pins down" }) });
  const spares = pct(session.sparePct);
  if (spares) stats.push({ value: spares, label: t({ message: "Spares", comment: "Bowling term: a card stat, the share of spare chances that were converted" }) });

  const eyebrow = [session.event?.trim(), formatCardDate(session.date)]
    .filter(Boolean)
    .join("  ·  ");

  return {
    eyebrow,
    title: session.alleyName || t`Bowling`,
    hero,
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
  if (stats.highGame !== null) supporting.push({ value: String(stats.highGame), label: t`High game` });
  const strikes = pct(stats.strikePct);
  if (strikes) supporting.push({ value: strikes, label: t({ message: "Strikes", comment: "Bowling term: a card stat, the share of first balls that knocked all ten pins down" }) });
  const spares = pct(stats.sparePct);
  if (spares) supporting.push({ value: spares, label: t({ message: "Spares", comment: "Bowling term: a card stat, the share of spare chances that were converted" }) });
  const pocket = pct(stats.pocketPct);
  if (pocket) supporting.push({ value: pocket, label: t({ message: "Pocket", comment: "Bowling term: a card stat, the share of first balls that hit the pocket (the gap between the 1 and 3 pins for a right-hander)" }) });
  const carry = pct(stats.carryPct);
  if (carry) supporting.push({ value: carry, label: t({ message: "Carry", comment: "Bowling term: a card stat, the share of pocket hits that struck" }) });

  const sessionCount = plural(stats.totalSessions, { one: "# session", other: "# sessions" });
  const gameCount = plural(stats.completedGames, { one: "# game", other: "# games" });

  return {
    eyebrow: `${sessionCount}  ·  ${gameCount}`,
    title: filterLabel,
    hero:
      stats.averageScore === null
        ? null
        : { value: String(Math.round(stats.averageScore)), label: t`Average` },
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
  /** The Stats tab's window ("Last 10 sessions", "Last 3 months"), absent on All. */
  range?: string;
}

/**
 * What the numbers on a stats card are actually about. Named parts only: an
 * unfiltered card says so rather than pretending to a scope it does not have.
 */
export function describeFilter(parts: FilterParts): string {
  const named = [parts.range ?? "", parts.alley, parts.pattern, parts.event].filter((p) => p.trim() !== "");
  if (parts.gameNumber !== null) named.push(t`Game ${{ gameNumber: parts.gameNumber }}`);
  if (parts.lanes.length > 0) {
    const lanes = parts.lanes.join(", ");
    named.push(plural(parts.lanes.length, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` }));
  }
  return named.length === 0 ? t`Every session` : named.join("  ·  ");
}

interface LayoutLike {
  /** `45 x 4 1/2 x 45`, the dual angle as a drill sheet writes it. */
  dualAngle: string;
  /** The same layout in the Storm VLS notation. */
  vls: string;
  symmetric: boolean;
  hand: "left" | "right";
  /** One-handed or two-handed, named on the card only when it is the rarer one. */
  grip: "1h" | "2h";
  /** The bowler's axis, written the way it is spoken: `5" over, 1/2" up`. */
  pap: string;
  /** What the ball will do, as the lab's rail reads it. */
  meters: ShareMeter[];
}

/** "Left hand", "Right hand, 2H": one message per case, since the order of the
 *  parts is the language's. */
function handAndGrip(hand: "left" | "right", grip: "1h" | "2h"): string {
  if (hand === "left") {
    return grip === "2h"
      ? t({ message: "Left hand, 2H", comment: "A ball layout card: the bowler throws left-handed with two hands (2H, two-handed style)" })
      : t({ message: "Left hand", comment: "A ball layout card: the bowler throws left-handed" });
  }
  return grip === "2h"
    ? t({ message: "Right hand, 2H", comment: "A ball layout card: the bowler throws right-handed with two hands (2H, two-handed style)" })
    : t({ message: "Right hand", comment: "A ball layout card: the bowler throws right-handed" });
}

/**
 * A layout, as a picture worth posting.
 *
 * The three numbers are the title because they are what a bowler asks another
 * bowler for, and the ball carries the card: a drill sheet reads as a drill
 * sheet, and the whole reason to share a layout rather than type it is that the
 * picture says where the pin went without anyone having to imagine it. So the
 * ball takes most of the card, and everything else is short (ADR-209): the
 * core in a word, the four readings as small bars rather than a sentence.
 */
export function buildLayoutCard(layout: LayoutLike): ShareCardData {
  const pap = layout.pap;
  return {
    // The axis rides the eyebrow rather than the stats: it is a condition the
    // three numbers are read under, like the core and the hand beside it, and
    // the card's lower half belongs to the ball.
    eyebrow: [
      layout.symmetric
        ? t({ message: "Sym", comment: "Bowling term, short for symmetric: a core with the same mass on both sides" })
        : t({ message: "Asym", comment: "Bowling term, short for asymmetric: a core with uneven mass distribution" }),
      handAndGrip(layout.hand, layout.grip),
      t({
        message: `PAP ${pap}`,
        comment: "Bowling term: PAP is the positive axis point, where the ball's axis of rotation sits on its surface; the value follows"
      })
    ].join("  ·  "),
    title: layout.dualAngle,
    readingTitle: true,
    hero: null,
    games: null,
    // The layout in the other notation, beside the bars. The flare figure used
    // to sit here and was the one number on the card that is a model's
    // opinion rather than a measurement; the bars say the same thing without
    // inviting a tenth of an inch to be read as a spec.
    stats: [{ value: layout.vls, label: "Storm VLS" }],
    meters: layout.meters
  };
}

interface LineLike {
  line: LineSpec;
  hand: Handedness;
  spare: boolean;
  /** The pins a spare line is aimed at, drawn standing on the deck. */
  leave?: PinNumber[];
  /** The pattern the line was drawn against, where it has a load table. */
  pattern?: { name: string; passes?: OilPass[] } | null;
}

/** A point on the lane: a board in the app's handed space (board 1 on the
 *  bowler's own side) and feet from the foul line. */
interface LanePoint {
  board: number;
  feet: number;
}

/** The lane a line card draws: the ball's path, its four marks, the oil it
 *  crosses and the pins it is thrown at. Built here so the card draws exactly
 *  the curve the visualizer does (`buildLinePath`), never a second copy of it. */
export interface ShareLane {
  hand: Handedness;
  path: LanePoint[];
  laydown: LanePoint;
  target: LanePoint;
  breakpoint: LanePoint | null;
  final: LanePoint;
  /** Oil bands in the sheet's left-edge numbering, shaded against `peak`. */
  oil: { bands: OilBand[]; peak: number; length: number; exit: LanePoint | null } | null;
  /** Pins drawn standing. Every pin on a strike line, the leave on a spare. */
  standing: PinNumber[];
}

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const boardText = (v: number) => formatNumber(Math.round(v * 2) / 2, 1);
const atFeet = (p: LanePoint) =>
  t`${{ board: boardText(p.board) }} at ${{ feet: formatNumber(Math.round(p.feet)) }} ft`;

/**
 * A line, as a picture of the lane it is thrown down.
 *
 * The lane is the card. A line is a shape, and three board numbers only say
 * it to someone who already pictures it: drawn, the laydown, the arrows, where
 * the ball turns and where it finishes read at a glance, against the oil it
 * was drawn on. The numbers sit beside it, each with what it is, so the card
 * still answers "where do I stand and what do I look at" without the link.
 */
export function buildLineCard(input: LineLike): ShareCardData {
  const { line, hand, spare } = input;
  const plane = buildLinePath(line, hand, spare);
  const mark = (p: { x: number; y: number }): LanePoint => ({
    board: xToBoard(p.x, hand),
    feet: yToFeet(p.y)
  });

  let lane: ShareLane | undefined;
  if (plane) {
    const zones = oilZones(input.pattern?.passes);
    const length = oilStats(input.pattern?.passes).length;
    const path = plane.samples.map((s) => ({ board: s.board, feet: s.feet }));
    lane = {
      hand,
      path,
      laydown: mark(plane.points.laydown),
      target: mark(plane.points.target),
      breakpoint: plane.points.breakpoint ? mark(plane.points.breakpoint) : null,
      final: mark(plane.points.final),
      oil: zones.length
        ? { bands: oilBands(zones), peak: peakUnits(zones), length, exit: oilExitPoint(length, path) }
        : null,
      standing: spare && input.leave?.length ? input.leave : ALL_PINS
    };
  }

  const stats: ShareStat[] = [];
  const laydown = line.laydown ?? line.stance;
  if (laydown != null) stats.push({ value: boardText(laydown), label: t({ message: "Laydown board", comment: "Bowling term: the board the ball is released over at the foul line" }) });
  if (line.target != null) stats.push({ value: boardText(line.target), label: t({ message: "Target at the arrows", comment: "Bowling term: the board the ball crosses at the arrows, about 15 feet down the lane" }) });
  if (lane?.breakpoint) stats.push({ value: atFeet(lane.breakpoint), label: t({ message: "Breakpoint", comment: "Bowling term: the point where the ball turns from skid to hook" }), swatch: PATH_INK });
  if (lane) {
    const pocket = !spare && Math.abs(lane.final.board - POCKET_BOARD) < 0.25;
    stats.push({ value: boardText(lane.final.board), label: pocket ? t({ message: "Into the pocket", comment: "Bowling term: the pocket is the gap between the 1 and 3 pins for a right-hander" }) : t`Finishes on` });
  }
  if (lane?.oil) {
    stats.push({ value: t`${{ feet: formatNumber(Math.round(lane.oil.length)) }} ft`, label: t`Pattern length` });
    if (lane.oil.exit) stats.push({ value: atFeet(lane.oil.exit), label: t({ message: "Leaves the oil", comment: "Bowling term: the point on the lane where the oil pattern ends" }), swatch: OIL_DOT });
  }

  const leavePin = input.leave?.[0];
  const leaveName = input.leave?.length ? formatLeave(input.leave) : "";
  const kind = !spare
    ? t({ message: "Strike line", comment: "Bowling term: the line (stance and target) thrown for a strike" })
    : input.leave?.length === 1
      ? t({ message: `${leavePin} pin spare`, comment: "Bowling term: a spare line for a single pin left standing, the pin number first, e.g. 7 pin spare" })
      : input.leave?.length
        ? t({ message: `${leaveName} spare`, comment: "Bowling term: a spare line for a leave of several pins, named by their numbers, e.g. 2-4-5-8 spare" })
        : t({ message: "Spare line", comment: "Bowling term: the line (stance and target) thrown to pick up a spare" });
  const patternName = input.pattern?.name?.trim();

  return {
    eyebrow: [handAndGrip(hand, "1h"), ...(patternName ? [kind] : [])].join("  ·  "),
    title: patternName || kind,
    hero: null,
    games: null,
    stats,
    lane
  };
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

/**
 * Greedy word wrap, capped at `maxLines` with an ellipsis on the last one. The
 * canvas has no text layout of its own, and a sentence is the one thing on this
 * card too long to shrink to a single line and still be read.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.length) {
    // Anything that did not fit is cut on the last line rather than dropped
    // silently, so the sentence reads as continuing rather than as ending
    // mid-thought.
    const used = lines.join(" ").split(/\s+/).length;
    if (used < words.length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

/**
 * A layout reading drawn the way the app shows it: the numbers at full
 * weight, the fractions a step down and the " x " separators dim, shrunk as a
 * whole until it fits. Without it the x's read as loudly as the numbers.
 */
function drawReading(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number
): void {
  type Run = { text: string; scale: number; dim: boolean };
  const runs: Run[] = [];
  text.split(" x ").forEach((part, i) => {
    if (i > 0) runs.push({ text: " x ", scale: 0.6, dim: true });
    const [whole, frac] = part.split(" ");
    runs.push({ text: whole, scale: 1, dim: false });
    if (frac) runs.push({ text: ` ${frac}`, scale: 0.62, dim: false });
  });
  const measure = (s: number) =>
    runs.reduce((w, r) => {
      ctx.font = font(r.dim ? 500 : 800, s * r.scale);
      return w + ctx.measureText(r.text).width;
    }, 0);
  let s = size;
  while (measure(s) > maxWidth && s > 32) s -= 4;
  let at = x;
  for (const r of runs) {
    ctx.font = font(r.dim ? 500 : 800, s * r.scale);
    ctx.fillStyle = r.dim ? CREAM_DIM : CREAM;
    ctx.fillText(r.text, at, y);
    at += ctx.measureText(r.text).width;
  }
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

const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35];
/** Pixels between pin rows. The real deck is under three feet deep and would
 *  be a smear at this scale, so the rack is drawn to be read, as the
 *  visualizer draws it, and only the lane in front of it is to scale. */
const DECK_ROW = 34;

/**
 * The lane, top-down: foul line at the bottom, pins at the top, board 1 of the
 * sheet on the left. Everything is placed in the sheet's left-edge numbering,
 * so a line's handed boards go through `toHandBoard` once, here.
 */
function drawLane(
  ctx: CanvasRenderingContext2D,
  lane: ShareLane,
  box: { x: number; y: number; w: number; h: number }
): void {
  const headY = box.y + 40 + 3 * DECK_ROW;
  // The foul line sits a little above the box's foot, so the laydown mark
  // has approach under it rather than hanging off the end of the lane.
  const bottom = box.y + box.h - 30;
  const toX = (sheetBoard: number) => box.x + ((sheetBoard - 0.5) / 39) * box.w;
  const toY = (feet: number) =>
    feet <= 60
      ? bottom - (Math.max(feet, 0) / 60) * (bottom - headY)
      : headY - ((feet - 60) / 0.866) * DECK_ROW;
  const handX = (board: number) => toX(toHandBoard(board, lane.hand));

  // The wood, and every fifth board, so the boards can be counted.
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 18);
  ctx.fillStyle = "rgba(255, 248, 237, 0.08)";
  ctx.fill();
  ctx.clip();
  // The approach, darker, below the foul line.
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(box.x, bottom, box.w, box.y + box.h - bottom);
  ctx.strokeStyle = "rgba(255, 248, 237, 0.07)";
  ctx.lineWidth = 2;
  for (let b = 5; b < 39; b += 5) {
    const x = toX(b + 0.5);
    ctx.beginPath();
    ctx.moveTo(x, box.y);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  // The oil, heavier where more of it went down.
  if (lane.oil) {
    const peak = lane.oil.peak > 0 ? lane.oil.peak : 1;
    for (const band of lane.oil.bands) {
      const left = toX(band.fromBoard) - box.w / 78;
      const width = ((band.toBoard - band.fromBoard + 1) * box.w) / 39;
      ctx.fillStyle = `rgba(${OIL_INK}, ${0.06 + 0.28 * (band.units / peak)})`;
      ctx.fillRect(left, toY(band.stop), width, toY(band.start) - toY(band.stop));
    }
    // Where the pattern ends, dashed across the lane.
    const endY = toY(lane.oil.length);
    ctx.strokeStyle = `rgba(${OIL_INK}, 0.7)`;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(box.x, endY);
    ctx.lineTo(box.x + box.w, endY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The arrows, on their chevron.
  ctx.fillStyle = "rgba(255, 248, 237, 0.45)";
  for (const b of ARROW_BOARDS) {
    const feet = 16 - (Math.abs(b - 20) / 15) * 4;
    const x = toX(b);
    const y = toY(feet);
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x - 7, y + 6);
    ctx.lineTo(x + 7, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // The pins. A spare card stands only the leave, the rest are ghosts.
  const standing = new Set(lane.standing);
  for (const pin of ALL_PINS) {
    const pos = PIN_POSITIONS[pin];
    const row = Math.round((pos.feet - 60) / 0.866);
    const x = toX(pos.board);
    const y = headY - row * DECK_ROW;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    if (standing.has(pin)) {
      ctx.fillStyle = CREAM;
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(255, 248, 237, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // The ball's path, kept on the lane: a spare line that misses rides its
  // aim straight on past the pins, and the card is not the place to show it
  // leaving the picture. Its marks go on top, unclipped.
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 18);
  ctx.clip();
  ctx.strokeStyle = PATH_INK;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  lane.path.forEach((p, i) => {
    const x = handX(p.board);
    const y = toY(p.feet);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  const dot = (p: LanePoint, r: number, fill: string, ring?: string) => {
    ctx.beginPath();
    ctx.arc(handX(p.board), toY(p.feet), r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  };
  if (lane.oil?.exit) dot(lane.oil.exit, 11, OIL_DOT, FELT);
  dot(lane.laydown, 14, CREAM, PATH_INK);
  dot(lane.target, 14, CREAM, PATH_INK);
  if (lane.breakpoint) dot(lane.breakpoint, 16, PATH_INK, CREAM);
  dot(lane.final, 12, PATH_INK, CREAM);
}

/** Renders the card and hands back a PNG. Rejects when the browser gives us no
 *  2D context, which is the only failure this can have. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t`This browser cannot draw the share image.`);

  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, W, H);

  // A lane-shaped band behind the hero, so the card has depth without needing
  // an image to load. A card carrying the ball has its own focal point and the
  // band only cuts across it.
  if (!data.diagram && !data.lane) {
    ctx.fillStyle = "rgba(255, 248, 237, 0.045)";
    ctx.fillRect(0, 296, W, 308);
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Eyebrow
  ctx.fillStyle = CREAM_DIM;
  // Shrunk to fit like everything else on the card: the layout card's eyebrow
  // carries three clauses and would otherwise run off the edge.
  fitText(ctx, data.eyebrow.toUpperCase(), PAD, 148, W - PAD * 2, 600, 30);

  // Title
  ctx.fillStyle = CREAM;
  if (data.readingTitle) drawReading(ctx, data.title, PAD, 244, W - PAD * 2, 92);
  else fitText(ctx, data.title, PAD, 244, W - PAD * 2, 800, 78);

  // Caption, wrapped over at most two lines. It is a sentence rather than a
  // number, so it takes the dim ink and sits directly under the title it
  // qualifies.
  let captionBottom = 244;
  if (data.caption) {
    ctx.fillStyle = CREAM_DIM;
    ctx.font = font(500, 34);
    const lines = wrapText(ctx, data.caption, W - PAD * 2, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD, 310 + i * 46);
    });
    captionBottom = 310 + (lines.length - 1) * 46;
  }

  // The ball, where the hero and the game boxes would have been. Square, and
  // centred, because it is the card rather than an illustration beside it.
  // A card with bars under the ball gives the ball everything between the
  // title and that block, which is most of the card.
  if (data.diagram) {
    const size = data.meters ? 800 : 640;
    const top = data.meters ? 272 : captionBottom + 16;
    ctx.drawImage(data.diagram, (W - size) / 2, top, size, size);
  }

  // The bars, two by two in the right half of the strip under the ball, small
  // on purpose: they say what the ball will do at a glance, and the ball is
  // the picture.
  if (data.meters) {
    const left = W / 2 + 12;
    const gap = 32;
    const cellW = (W - PAD - left - gap) / 2;
    data.meters.slice(0, 4).forEach((m, i) => {
      const x = left + (i % 2) * (cellW + gap);
      const y = 1092 + Math.floor(i / 2) * 48;
      ctx.font = font(700, 22);
      ctx.fillStyle = CREAM;
      ctx.textAlign = "left";
      ctx.fillText(m.label.toUpperCase(), x, y + 18);
      ctx.font = font(500, 22);
      ctx.fillStyle = CREAM_DIM;
      ctx.textAlign = "right";
      ctx.fillText(m.word, x + cellW, y + 18);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 248, 237, 0.18)";
      roundRect(ctx, x, y + 28, cellW, 8, 4);
      ctx.fill();
      ctx.fillStyle = "#5fcfae";
      roundRect(ctx, x, y + 28, Math.max(8, cellW * Math.min(1, Math.max(0, m.value))), 8, 4);
      ctx.fill();
    });
  }

  // Hero. Shrunk to fit like the title: a six-game series runs to four digits.
  if (data.hero) {
    ctx.fillStyle = CREAM;
    fitText(ctx, data.hero.value, PAD, 552, W - PAD * 2 - 240, 800, 210);
    const heroWidth = ctx.measureText(data.hero.value).width;
    ctx.fillStyle = CREAM_DIM;
    ctx.font = font(600, 34);
    ctx.fillText(data.hero.label.toUpperCase(), PAD + heroWidth + 24, 552);
  }

  // Game boxes, drawn like the app's own scorecard. Up to six share one row;
  // more wrap onto a second, shorter row rather than being dropped, so a seven
  // game night shows all seven.
  const games = data.games ?? [];
  const hasGames = games.length > 0;
  const boxY = 664;
  let gamesBottom = boxY;
  if (hasGames) {
    const gap = 16;
    const rows = games.length > 6 ? 2 : 1;
    const perRow = Math.ceil(games.length / rows);
    const boxW = (W - PAD * 2 - gap * (perRow - 1)) / perRow;
    const boxH = rows === 1 ? 130 : 104;
    games.forEach((score, i) => {
      const x = PAD + (i % perRow) * (boxW + gap);
      const y = boxY + Math.floor(i / perRow) * (boxH + gap);
      ctx.fillStyle = "rgba(255, 248, 237, 0.08)";
      roundRect(ctx, x, y, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 248, 237, 0.16)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = CREAM_DIM;
      ctx.font = font(600, rows === 1 ? 24 : 20);
      ctx.fillText(`G${i + 1}`, x + boxW / 2, y + (rows === 1 ? 44 : 34));
      ctx.fillStyle = CREAM;
      // Shrinks only when a narrow box cannot hold the score.
      const size = rows === 1 ? 54 : 46;
      fitText(ctx, score, x + boxW / 2, y + (rows === 1 ? 104 : 84), boxW - 16, 700, size);
      ctx.textAlign = "left";
    });
    gamesBottom = boxY + rows * boxH + (rows - 1) * gap;
  }

  // A line card: the lane down the left, its numbers stacked beside it.
  if (data.lane) {
    drawLane(ctx, data.lane, { x: PAD, y: 312, w: 330, h: 856 });
    const colX = PAD + 330 + 64;
    const colW = W - PAD - colX;
    data.stats.slice(0, 6).forEach((stat, i) => {
      const rowY = 330 + i * 140;
      ctx.fillStyle = CREAM;
      fitText(ctx, stat.value, colX, rowY + 60, colW, 700, 64);
      let labelX = colX;
      if (stat.swatch) {
        ctx.beginPath();
        ctx.arc(colX + 9, rowY + 89, 9, 0, Math.PI * 2);
        ctx.fillStyle = stat.swatch;
        ctx.fill();
        labelX = colX + 30;
      }
      ctx.fillStyle = CREAM_DIM;
      ctx.font = font(600, 26);
      ctx.fillText(stat.label.toUpperCase(), labelX, rowY + 98);
    });
  }

  // Supporting stats, two per row. A session card has game boxes above it and
  // room for two rows; a stats card has neither and takes three, which is why
  // the start moves rather than the spacing. A second row of boxes pushes them
  // down, and two rows of stats still clear the footer rule at 1200.
  const shown = data.lane ? [] : data.stats.slice(0, hasGames ? 4 : 6);
  // Under the ball, clear of the footer rule at 1200: one row of two, which is
  // what is left of the card once the picture has had its share of it.
  // With bars, the one stat sits in the strip's left half, level with them.
  const statsY = data.meters ? 1080 : data.diagram ? 1000 : hasGames ? Math.max(872, gamesBottom + 48) : 700;
  const colW = (W - PAD * 2) / 2;
  shown.forEach((stat, i) => {
    const x = PAD + (i % 2) * colW;
    const rowY = statsY + Math.floor(i / 2) * (hasGames && statsY > 872 ? 112 : 126);
    ctx.fillStyle = CREAM;
    // Shrunk to fit its own column: a Storm VLS reading is three fractions
    // long and would otherwise run into the stat beside it.
    if (data.readingTitle) drawReading(ctx, stat.value, x, rowY + 60, colW - 40, 60);
    else fitText(ctx, stat.value, x, rowY + 60, colW - 32, 700, 66);
    ctx.fillStyle = CREAM_DIM;
    ctx.font = font(600, 26);
    ctx.fillText(stat.label.toUpperCase(), x, rowY + 98);
  });

  // Footer wordmark, with the mark beside it. The entire reason a share is
  // worth building, so it is cream rather than the brand green, which on this
  // ground is barely legible.
  ctx.fillStyle = "rgba(255, 248, 237, 0.16)";
  ctx.fillRect(PAD, 1200, W - PAD * 2, 2);

  let textX = PAD;
  if (data.mark) {
    const size = 56;
    ctx.drawImage(data.mark, PAD, 1268 - size + 10, size, size);
    textX = PAD + size + 20;
  }

  ctx.fillStyle = CREAM;
  ctx.font = font(800, 46);
  ctx.fillText("Headpin", textX, 1268);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(t`The share image could not be created.`));
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

/** Hand a rendered card straight to the device, with no share sheet in
 *  between. The lab's own download control wants exactly this: the sheet is
 *  what the share button is for, and a "save it" that opens a chooser is not
 *  the thing that was asked for. */
export async function downloadCardImage(blob: Blob, filename: string): Promise<void> {
  // The store apps have no downloads folder to put it in: "save" there is the
  // platform's sheet, which carries Save Image and Save to Files (ADR-156).
  if (isNativeApp()) {
    await shareFileFromApp(filename, blob);
    return;
  }
  download(blob, filename);
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
  // The store apps' web views have no Web Share on Android and drop a
  // download, so the platform's own sheet takes the picture (ADR-156).
  if (isNativeApp()) return shareFileFromApp(filename, blob);

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
