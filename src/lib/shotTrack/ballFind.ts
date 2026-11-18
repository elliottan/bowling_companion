import { findCandidates, type Candidate } from "./ballDetect";
import { medianBackground, steady, type Roi } from "./background";
import { MAX_SPEED_FTS, MIN_SPEED_FTS } from "./associate";
import { apply, multiply, normalize } from "./homography";
import { BALL_DIAMETER_BOARDS, expectedRadiusPx, LEFT_U, RIGHT_U } from "./laneModel";
import { laneTrack, type FrameLane } from "./laneTrack";
import { frameShift, shrink, type Shift } from "./shotStart";
import type { GrayFrame, Mat3 } from "./types";

/**
 * The ball found directly in a stretch of the read's own frames, with the lane
 * known (`readShot.ts`): the first look (`shotStart.ts`) is a cheap guess on
 * 192 pixel frames, and its runs are only centroids that changed, so the
 * bowler's arm or the ball in the swing, high above the lane, can read
 * through the floor's mapping as a run up it at a ball's speed (IMG_1996: the
 * pushaway at 1.4 to 1.7 s read from 7 ft behind the foul line to 5 ft past
 * it). Here the decision is made where the lane is known:
 *
 * 1. Every second frame at half size, steadied on the frame the lane was
 *    found best on (a shift found by search: a phone held in the hand pans),
 *    over the lane from behind the foul line to `SEARCH_FT`.
 * 2. The empty lane is the median of those frames, and a candidate is a blob
 *    that differs from it and is a ball's width for the lane row it stands on
 *    (`findCandidates`). Anything held above the lane is wider than a ball
 *    for the row its foot maps to, so the bowler, an arm and the ball in the
 *    swing fail on size; the ball on the lane is the one thing that fits.
 * 3. Candidates frame after frame, each a little further up the lane and
 *    near the last across, are chained (`chains`), and a chain is the ball
 *    (`judgeSightings`) when there are
 *    `MIN_SEEN` of them or more over `MIN_SPAN_FT`, at a ball's speed, on a
 *    straight line in time, first seen within `FIRST_NEAR_FT` of the foul
 *    line: the bowler lets go at the foul line, and from there the ball goes
 *    only up the lane.
 *
 * The straight line through them (feet against seconds) says when the ball
 * crossed the foul line and how fast it went. Pure.
 */

/** Every this many frames of the read are looked at. */
export const FIND_EVERY = 2;
/** At this many times smaller each way. */
export const FIND_SCALE = 2;
/** The lane is searched from behind the foul line to this far up it, feet. */
export const SEARCH_FT = 32;
/** The fewest sightings that are the ball. */
export const MIN_SEEN = 6;
/** ...over at least this many feet... */
export const MIN_SPAN_FT = 5;
/** ...the first of them no further up the lane than this, feet: the ball is let go at the foul line. */
export const FIRST_NEAR_FT = 15;
/** The sightings' spread about their straight line, feet, at most (a fraction of a foot on the ball; a pixel is a few tenths of a foot at 30 ft). */
export const LINE_RMS_FT = 1.5;

/** The ball as found: when it crossed the foul line, its speed, and where it was seen. */
export interface BallSeen {
  /** When the ball crossed the foul line, seconds (its straight line in time at 0 ft). */
  foul: number;
  /** Feet a second up the lane. */
  speed: number;
  sightings: { t: number; u: number; v: number }[];
}

/** What the search found: the ball, or why not, and how many candidates it had. */
export interface BallSearch {
  seen: BallSeen | null;
  /**
   * The ball was seen, but first further up the lane than `FIRST_NEAR_FT`:
   * it crossed the foul line before these frames, at about this time.
   */
  earlier: number | null;
  candidates: number;
  why: string;
}

/** A gray frame `k` times smaller each way, one byte a pixel. */
function smaller(f: GrayFrame, k: number): GrayFrame & { data: Uint8Array } {
  const w = Math.max(1, Math.floor(f.width / k));
  const h = Math.max(1, Math.floor(f.height / k));
  const out = new Uint8Array(w * h);
  const d = f.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) {
        const row = (y * k + j) * f.width + x * k;
        for (let i = 0; i < k; i++) s += d[row + i];
      }
      out[y * w + x] = Math.round(s / (k * k));
    }
  }
  return { width: w, height: h, data: out, t: f.t };
}

const shiftMat = (s: Shift): Mat3 => [1, 0, s.dx, 0, 1, s.dy, 0, 0, 1];

/**
 * The box of a frame's pixels round the lane from 4 ft behind the foul line
 * to `SEARCH_FT` and 3 boards beyond either edge, raised by a ball's height
 * (`laneRoi` in `background.ts`, to the near lane only).
 */
export function nearRoi(H: Mat3, width: number, height: number): Roi {
  const pts = [];
  for (const u of [LEFT_U - 3, RIGHT_U + 3]) for (const v of [-4, 0, SEARCH_FT]) pts.push(apply(H, { x: u, y: v }));
  const lift = 2.6 * expectedRadiusPx(H, 20, -4) + 4;
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const x1 = Math.min(width, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 0.8 * lift - BALL_DIAMETER_BOARDS));
  const y1 = Math.min(height, Math.ceil(Math.max(...pts.map((p) => p.y)) + lift));
  return { x0, y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/** The straight line (feet against seconds) through points, and their spread about it. */
export function feetLine(ps: readonly { t: number; v: number }[]): { speed: number; foul: number; rms: number } | null {
  if (ps.length < 2) return null;
  const mt = ps.reduce((a, p) => a + p.t, 0) / ps.length;
  const mv = ps.reduce((a, p) => a + p.v, 0) / ps.length;
  let num = 0;
  let den = 0;
  for (const p of ps) {
    num += (p.t - mt) * (p.v - mv);
    den += (p.t - mt) ** 2;
  }
  if (!(den > 1e-12)) return null;
  const speed = num / den;
  const rms = Math.sqrt(ps.reduce((a, p) => a + (p.v - (mv + speed * (p.t - mt))) ** 2, 0) / ps.length);
  return { speed, foul: speed > 0 ? mt - mv / speed : NaN, rms };
}

/** Sightings further apart in time than this are two pieces, seconds (three frames looked at, at 30 a second). */
export const PIECE_GAP_S = 0.12;
/** A piece of the run steps back down the lane by no more than this between sightings, feet (a pixel's error at 30 ft). */
export const STEP_BACK_FT = 0.5;
/** How long a piece is checked for standing still over, seconds (`judgeSightings`). */
export const STAND_S = 0.1;
/** Another piece is the same ball when its sightings are within this many feet of the main piece's line, and a tenth of their distance more. */
export const ON_LINE_FT = 2;

/** A place the ball may have been: seconds, boards across, feet up the lane. */
export type Sighting = { t: number; u: number; v: number };

/** Boards across the ball may move between two sightings in a chain, and this much more for each foot up the lane. */
export const CHAIN_BOARDS = 2;
export const CHAIN_BOARDS_FT = 0.5;
/** Feet a sighting may be ahead of where the fastest ball could be (a pixel's error at 30 ft). */
export const CHAIN_SLACK_FT = 0.7;

/**
 * Chains of candidates (`cands`, any order) one after another in time, no
 * further apart than `PIECE_GAP_S`, each no more than `STEP_BACK_FT` back
 * down the lane and no further up than the fastest ball goes in the time
 * (`CHAIN_SLACK_FT` more), and near the last across (`CHAIN_BOARDS`): for
 * each candidate no chain goes on from, the longest into it. Longest first.
 */
export function chains<T extends Sighting>(cands: readonly T[]): T[][] {
  const sorted = [...cands].sort((a, b) => a.t - b.t);
  const len = new Array<number>(sorted.length).fill(1);
  const prev = new Array<number>(sorted.length).fill(-1);
  const extended = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    let bestDu = Infinity;
    for (let j = i - 1; j >= 0; j--) {
      const p = sorted[j];
      const dt = c.t - p.t;
      if (dt > PIECE_GAP_S) break;
      if (!(dt > 1e-6)) continue;
      const dv = c.v - p.v;
      const du = Math.abs(c.u - p.u);
      if (dv < -STEP_BACK_FT || dv > MAX_SPEED_FTS * dt + CHAIN_SLACK_FT || du > CHAIN_BOARDS + CHAIN_BOARDS_FT * Math.max(0, dv)) continue;
      if (len[j] + 1 > len[i] || (len[j] + 1 === len[i] && du < bestDu)) {
        len[i] = len[j] + 1;
        prev[i] = j;
        bestDu = du;
      }
    }
    if (prev[i] >= 0) extended.add(prev[i]);
  }
  const ends = sorted.map((_, i) => i).filter((i) => !extended.has(i));
  ends.sort((a, b) => len[b] - len[a] || a - b);
  return ends.map((end) => {
    const chain: T[] = [];
    for (let k = end; k >= 0; k = prev[k]) chain.unshift(sorted[k]);
    return chain;
  });
}

/** How many of the longest chains are judged. */
export const CHAINS_JUDGED = 6;

/**
 * Whether sightings in time order are the ball's run (see the header), and
 * its line; a reason when not. The run is the longest piece of sightings
 * close in time (`PIECE_GAP_S`), each a little further up the lane than the
 * last and none standing still (`STAND_S`): a chain can run from the ball
 * onto a thing standing still on the lane. The other pieces on its straight
 * line in time are the ball too (it is lost behind the bowler for a few
 * frames): looked for among `all`, every candidate, the nearest a frame.
 * Its line must cross the foul line no earlier than `from` (the first frame
 * looked at), less a frame or two: a ball first seen out on the lane crossed
 * it before these frames, and is answered as `earlier` with that time, as is
 * one first seen past `FIRST_NEAR_FT`.
 */
export function judgeSightings(set: readonly Sighting[], from = -Infinity, all: readonly (Sighting & { frame?: number })[] = set): { seen: BallSeen | null; earlier: number | null; why: string } {
  const no = (why: string) => ({ seen: null, earlier: null, why });
  const pieces: Sighting[][] = [];
  for (const p of set) {
    const last = pieces[pieces.length - 1];
    const end = last?.[last.length - 1];
    // Over a tenth of a second or more the ball has gone at least half the slowest ball's way: a thing standing on the lane has not.
    const back = last ? [...last].reverse().find((q) => p.t - q.t >= STAND_S - 1e-6) : undefined;
    const stands = !!back && p.v - back.v < 0.5 * MIN_SPEED_FTS * (p.t - back.t);
    if (end && p.t - end.t <= PIECE_GAP_S && p.v >= end.v - STEP_BACK_FT && !stands) last.push(p);
    else pieces.push([p]);
  }
  const main = pieces.reduce<Sighting[]>((a, p) => (p.length > a.length ? p : a), []);
  if (main.length < MIN_SEEN) return no(`${set.length} sightings, ${main.length} in a row`);
  const span = (ps: readonly { v: number }[]) => Math.max(...ps.map((p) => p.v)) - Math.min(...ps.map((p) => p.v));
  if (span(main) < MIN_SPAN_FT) return no(`${main.length} sightings in a row over ${span(main).toFixed(1)} ft`);
  const own = feetLine(main);
  if (!own || !(own.speed >= MIN_SPEED_FTS && own.speed <= MAX_SPEED_FTS * 1.05)) return no(`${main.length} sightings in a row at ${own ? own.speed.toFixed(1) : "no"} ft/s`);
  if (own.rms > LINE_RMS_FT) return no(`${main.length} sightings in a row ${own.rms.toFixed(1)} ft off their line`);
  // The other pieces on the main piece's line.
  const at = (t: number) => own.speed * (t - own.foul);
  const near = new Map<number, Sighting>();
  const off = (p: Sighting) => Math.abs(p.v - at(p.t));
  for (const p of all) {
    if (main.some((q) => q.t === p.t) || off(p) > ON_LINE_FT + 0.1 * Math.max(0, at(p.t))) continue;
    const was = near.get(p.t);
    if (!was || off(p) < off(was)) near.set(p.t, p);
  }
  const run = [...main, ...near.values()].sort((a, b) => a.t - b.t);
  const line = feetLine(run) ?? own;
  const first = Math.min(...run.map((p) => p.v));
  const seen = { foul: line.foul, speed: line.speed, sightings: run.map((p) => ({ t: p.t, u: p.u, v: p.v })) };
  const said = `${run.length} sightings, ${first.toFixed(0)} to ${Math.max(...run.map((p) => p.v)).toFixed(0)} ft at ${line.speed.toFixed(1)} ft/s`;
  if (first > FIRST_NEAR_FT) return { seen: null, earlier: line.foul, why: `${said}, first seen too far up the lane` };
  if (line.foul < from - FOUL_EARLY_S) return { seen: null, earlier: line.foul, why: `${said}, over the foul line before these frames` };
  return { seen, earlier: null, why: said };
}

/** The ball's line may cross the foul line this long before the first frame looked at, seconds. */
export const FOUL_EARLY_S = 0.1;

/**
 * The ball in `frames` (a stretch of the read, in time order), with the lane
 * found on some of them (`lanes`, by index into `frames`). See the header.
 */
export function findBall(frames: readonly GrayFrame[], lanes: readonly FrameLane[]): BallSearch {
  const none = (why: string, candidates = 0): BallSearch => ({ seen: null, earlier: null, candidates, why });
  const usable = lanes.filter((l) => l.frame >= 0 && l.frame < frames.length && l.H.every(Number.isFinite));
  if (!usable.length || frames.length < 3) return none("no lane");
  const ref = usable.reduce((a, l) => ((l.weight ?? 1) > (a.weight ?? 1) ? l : a)).frame;
  // The frames looked at: every `FIND_EVERY`th, counted from the reference.
  const picked = frames.flatMap((_, i) => ((i - ref) % FIND_EVERY === 0 ? [i] : []));
  const k = FIND_SCALE;
  const half = new Map(picked.map((i) => [i, smaller(frames[i], k)]));
  const tiny = new Map(picked.map((i) => [i, shrink(half.get(i)!, 4)]));
  const base = half.get(ref)!;
  // Each frame's shift onto the reference: coarse on copies 4 times smaller, then to the pixel.
  const shifts = new Map<number, Shift>(
    picked.map((i) => {
      if (i === ref) return [i, { dx: 0, dy: 0 }];
      const rough = frameShift(tiny.get(ref)!, tiny.get(i)!, 4, undefined, 1);
      return [i, frameShift(base, half.get(i)!, 0, { dx: rough.dx * 4, dy: rough.dy * 4 }, 3)];
    })
  );
  // The found lanes in half size pixels, carried between frames by the shifts.
  const scale: Mat3 = [1 / k, 0, 0, 0, 1 / k, 0, 0, 0, 1];
  const shiftOf = (i: number) => shifts.get(i) ?? shifts.get(picked.reduce((a, j) => (Math.abs(j - i) < Math.abs(a - i) ? j : a)))!;
  const halfLanes = usable.map((l) => ({ ...l, H: normalize(multiply(scale, l.H)) }));
  const carry = (from: number, to: number): Mat3 => {
    const a = shiftOf(from);
    const b = shiftOf(to);
    return shiftMat({ dx: b.dx - a.dx, dy: b.dy - a.dy });
  };
  const track = laneTrack(halfLanes, carry, picked);
  const H0 = track.H.get(ref);
  if (!H0) return none("no lane on the reference frame");
  const roi = nearRoi(H0, base.width, base.height);
  const steadied = picked.map((i) => steady(half.get(i)!, shiftMat(shifts.get(i)!), roi));
  const bg = medianBackground(steadied);
  const cands: Candidate[] = [];
  picked.forEach((i, j) => {
    const H = track.H.get(i);
    if (H) cands.push(...findCandidates(steadied[j], bg, roi, shiftMat(shifts.get(i)!), H, i));
  });
  if (!cands.length) return none("no candidates");
  // The longest chains in turn: the first that is the ball, else the first seen out on the lane, else why the longest is not.
  const from = frames[picked[0]].t;
  const judged = chains(cands).slice(0, CHAINS_JUDGED).map((c) => judgeSightings(c, from, cands));
  const pick = judged.find((j) => j.seen) ?? judged.find((j) => j.earlier !== null) ?? judged[0];
  return { ...pick, candidates: cands.length };
}
