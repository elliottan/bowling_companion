/**
 * Where the shot is in a longer video (Settings, Labs, the shot tracer): a
 * first look at the whole video in small grey frames, about 15 a second,
 * before the full read of the few seconds the tracer needs. The bowler picks
 * any video with one shot in it (the stance, the approach, the shot, the
 * pins, the walk back) and this says where the shot is, and for a portrait
 * video which band of the picture the lane is in.
 *
 * The rule is the ball's run up the lane, not the first thing that moves:
 *
 * - A candidate is a small blob that changed in its own frame alone (darker,
 *   or lighter, than the same place a frame before and a frame after, by
 *   `CHANGE`), with little else changing round it (`alone`). A walking,
 *   swinging bowler changes as a whole: a hand or a foot has the rest of the
 *   body changing next to it. The ball out on the lane has nothing.
 * - A run is a chain of candidates, frame after frame (a frame or two may be
 *   missed), each higher in the picture than the last, mostly up rather than
 *   across, no faster than `MAX_RISE_RATE`, and with steps that do not grow
 *   much (the ball slows in the picture as it goes away).
 * - The shot is the longest run of at least `MIN_RUN_POINTS` that rises
 *   `MIN_RUN_RISE` of the picture in `MIN_RUN_SECONDS`, in the middle of the
 *   picture across (the bowler films their own lane from behind; a ball on
 *   the next lane runs up one side).
 *
 * The pins being hit (a burst of change just above where the run ends) is
 * looked for after the run and reported, but the run alone decides: on the
 * owner's own videos the bowler often stands in front of the pins.
 *
 * Frames are compared after taking out the camera's own movement between
 * them (a shift found by search), since a phone held in the hand pans.
 *
 * Streaming (`ShotSearch`): a frame is looked at as it comes and only the
 * last three are kept, with a 4 times smaller copy of each for the pins, so a
 * two minute video costs a few megabytes. Pure: frames in, times and picture
 * fractions out; `src/shotTracer/` reads the frames.
 */

export interface CoarseFrame {
  width: number;
  height: number;
  /** Grey, one byte a pixel, row-major (the video's own grey, 16 to 235). */
  data: Uint8Array | Uint8ClampedArray;
  /** Seconds into the video. */
  t: number;
}

/** A place the ball was seen on the first look: picture fractions (0 to 1) and seconds. */
export interface RunPoint {
  t: number;
  x: number;
  y: number;
}

export interface ShotFound {
  /** Where to start the full read, seconds: a little before the release. */
  start: number;
  /** When the ball is first seen going up the lane, seconds: at or a little before or after it leaves the hand. */
  release: number;
  /** When the pins are hit, seconds, when it was seen. */
  pinHit: number | null;
  /** 0 to 1: how clear the run was. */
  confidence: number;
  /** The ball's run, as found. */
  run: RunPoint[];
  /**
   * Every other run of three points or more, those that pass for the ball's
   * first (longest first), up to `OTHER_RUNS`: the bowler's approach can win
   * on length (IMG_1996: the run chosen was the approach, 13 ft behind the
   * foul line, on most looks), and the ball's own run can fail the picture's
   * tests on a look (seen for 4 frames rather than 5, it did not slow enough).
   * Once the lane is found, the runs are judged in feet (`shotWindow.ts`).
   */
  others?: RunPoint[][];
  /**
   * No run passed for the ball's in the picture (`isShotRun`): `run` is only
   * the longest seen. The shot is taken as found only if the lane then shows
   * one of the runs is the ball's (`readShot.ts`).
   */
  guessed?: boolean;
}

/** The width the first look reads a video at, pixels, and how many frames a second it wants. */
export const COARSE_WIDTH = 192;
export const COARSE_FPS = 15;

/**
 * How far before the ball is first seen the full read starts, seconds. The run
 * is first seen anywhere from the bottom of the swing (shot-05's original, a
 * tenth of a second before the release) to a few feet down the lane (at 25
 * ft/s, 5 ft is a fifth of a second), at 15 frames a second: this covers the
 * foul line in every case. The tracer itself needs only a few frames before
 * the crossing (`shotWindow.ts`, which drops the rest once the lane is found).
 */
export const LEAD_SECONDS = 0.4;

/** The most other runs a look reports beside the one chosen (`ShotFound.others`), and the fewest points each has. */
export const OTHER_RUNS = 16;
export const OTHER_RUN_POINTS = 3;

/** A pixel has changed when its grey moved this much (video range), the same way, against both neighbours. */
export const CHANGE = 12;

/** A candidate is no wider than this fraction of the picture's width, nor taller than twice it (the ball and its reflection). */
export const MAX_BALL = 0.15;
/** ...covers no more than this times the width squared... */
export const MAX_AREA = 0.01;
/** ...and no fewer pixels than this: fewer is noise. */
export const MIN_AREA = 4;
/** How far round a candidate is looked at for other change, a fraction of the width (`alone`). */
export const ALONE_REACH = 0.06;
/** A frame with more candidates than this (the camera jolted) offers none. */
const MAX_BLOBS = 40;

/** The ball rises no faster than this, picture heights a second (0.54 measured just past the foul line on shot-05's original). */
export const MAX_RISE_RATE = 0.7;

/** The fewest points in a run, and the least time and rise (a fraction of the picture's height) it covers. */
export const MIN_RUN_POINTS = 4;
export const MIN_RUN_SECONDS = 0.2;
export const MIN_RUN_RISE = 0.04;
/**
 * ...and rises no more than this: the ball's whole run, foul line to pins, is
 * 15% of the height of the owner's portrait originals and 26 to 35% of the
 * sample clips cut from them.
 */
export const MAX_RUN_RISE = 0.4;
/** The longest gap between two points of a run, seconds. */
export const MAX_GAP = 0.25;
/** A run's mean place across, as a fraction of the width, is this far from the middle at most. */
export const RUN_OFF_CENTER = 0.25;

/** The pins are looked for this long after the run ends, seconds. */
export const PIN_WITHIN = 3.5;

export interface Blob {
  frame: number;
  /** Centroid, pixels. */
  x: number;
  y: number;
  area: number;
}

export interface Shift {
  dx: number;
  dy: number;
}

/** Mean absolute difference of `a` and `b` shifted by (dx, dy), every `step`th pixel inside a margin. */
function shiftCost(a: CoarseFrame, b: CoarseFrame, dx: number, dy: number, margin: number, step: number): number {
  const { width: w, height: h } = a;
  let cost = 0;
  let n = 0;
  for (let y = margin; y < h - margin; y += step) {
    const ra = y * w;
    const rb = (y + dy) * w + dx;
    for (let x = margin; x < w - margin; x += step) {
      cost += Math.abs(a.data[ra + x] - b.data[rb + x]);
      n++;
    }
  }
  // A tie goes to the smaller shift: a still camera stays still.
  return cost / Math.max(1, n) + 0.01 * (Math.abs(dx) + Math.abs(dy));
}

/**
 * The shift (dx, dy) that best lays frame `b` on frame `a`: b(x + dx, y + dy)
 * is a(x, y), searched up to `reach` pixels each way; around `around` only
 * when given.
 */
export function frameShift(a: CoarseFrame, b: CoarseFrame, reach = Math.max(1, Math.round(a.width / 32)), around?: Shift, step = 2): Shift {
  const c = around ?? { dx: 0, dy: 0 };
  const r = around ? 2 : reach;
  const margin = Math.abs(c.dx) + Math.abs(c.dy) + r + 1;
  let best = c;
  let bestCost = Infinity;
  for (let dy = c.dy - r; dy <= c.dy + r; dy++) {
    for (let dx = c.dx - r; dx <= c.dx + r; dx++) {
      const cost = shiftCost(a, b, dx, dy, margin, step);
      if (cost < bestCost) {
        bestCost = cost;
        best = { dx, dy };
      }
    }
  }
  return best;
}

/** A grey frame `k` times smaller each way, each pixel the mean of its block. */
export function shrink(f: CoarseFrame, k: number): CoarseFrame {
  const w = Math.max(1, Math.floor(f.width / k));
  const h = Math.max(1, Math.floor(f.height / k));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) {
        const row = (y * k + j) * f.width + x * k;
        for (let i = 0; i < k; i++) s += f.data[row + i];
      }
      out[y * w + x] = s / (k * k);
    }
  }
  return { width: w, height: h, data: out, t: f.t };
}

/**
 * The pixels of `cur` that changed in that frame alone: different from both
 * neighbours (each laid on it by its shift) by `CHANGE` or more, the same way.
 * 1 where changed.
 */
export function changedAlone(prev: CoarseFrame, cur: CoarseFrame, next: CoarseFrame, sPrev: Shift, sNext: Shift): Uint8Array {
  const { width: w, height: h } = cur;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yp = y + sPrev.dy;
    const yn = y + sNext.dy;
    if (yp < 0 || yp >= h || yn < 0 || yn >= h) continue;
    for (let x = 0; x < w; x++) {
      const xp = x + sPrev.dx;
      const xn = x + sNext.dx;
      if (xp < 0 || xp >= w || xn < 0 || xn >= w) continue;
      const c = cur.data[y * w + x];
      const d1 = c - prev.data[yp * w + xp];
      const d2 = c - next.data[yn * w + xn];
      if ((d1 >= CHANGE && d2 >= CHANGE) || (d1 <= -CHANGE && d2 <= -CHANGE)) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface Part {
  x: number;
  y: number;
  area: number;
  bw: number;
  bh: number;
}

/** The connected parts (8-connected) of a mask, as centroid, area and box size. */
export function blobsOf(mask: Uint8Array, w: number, h: number): Part[] {
  const seen = new Uint8Array(w * h);
  const out: Part[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let sx = 0;
    let sy = 0;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      area++;
      sx += x;
      sy += y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    out.push({ x: sx / area, y: sy / area, area, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  }
  return out;
}

/**
 * Whether a part stands on its own: in a box `ALONE_REACH` of the width
 * round it, no more other change than the part itself.
 */
export function alone(mask: Uint8Array, w: number, h: number, b: Part): boolean {
  const r = Math.max(2, Math.round(ALONE_REACH * w));
  const x0 = Math.max(0, Math.round(b.x - b.bw / 2 - r));
  const x1 = Math.min(w - 1, Math.round(b.x + b.bw / 2 + r));
  const y0 = Math.max(0, Math.round(b.y - b.bh / 2 - r));
  const y1 = Math.min(h - 1, Math.round(b.y + b.bh / 2 + r));
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += mask[y * w + x];
  return n - b.area <= b.area;
}

/** The candidates for the ball on `cur` (see the header), as frame `frame`. */
export function candidatesOn(prev: CoarseFrame, cur: CoarseFrame, next: CoarseFrame, sPrev: Shift, sNext: Shift, frame: number): Blob[] {
  const { width: w, height: h } = cur;
  const mask = changedAlone(prev, cur, next, sPrev, sNext);
  const max = MAX_BALL * w;
  const kept = blobsOf(mask, w, h).filter(
    (b) => b.area >= MIN_AREA && b.area <= MAX_AREA * w * w && b.bw <= max && b.bh <= 2 * max && alone(mask, w, h, b)
  );
  if (kept.length > MAX_BLOBS) return [];
  return kept.map((b) => ({ frame, x: b.x, y: b.y, area: b.area }));
}

interface Node {
  blob: Blob;
  /** Best run ending here: its length, and the node before. */
  len: number;
  prev: Node | null;
  /** The step into this node, pixels a second up the picture. */
  rate: number;
}

/**
 * The rate (pixels a second up the picture) at which `b` follows `a`, `dt`
 * seconds later, on the ball's run, or null when it cannot: higher in the
 * picture, no faster than `MAX_RISE_RATE`, mostly up rather than across, not
 * much larger, and neither much faster nor much slower than the step before.
 * `offset` is the camera's movement from `a`'s frame to `b`'s: a still point
 * at (x, y) in `a`'s frame is at (x + dx, y + dy) in `b`'s.
 */
function follows(a: Node, b: Blob, dt: number, h: number, offset: Shift): number | null {
  const ax = a.blob.x + offset.dx;
  const ay = a.blob.y + offset.dy;
  const rise = ay - b.y;
  if (rise < 0.25) return null;
  if (rise > MAX_RISE_RATE * h * dt + 1) return null;
  if (Math.abs(b.x - ax) > 0.5 * rise + 1.5) return null;
  if (b.area > 2 * a.blob.area + 6) return null;
  const rate = rise / dt;
  if (a.prev && (rate > 1.3 * a.rate + 0.02 * h || rate < 0.3 * a.rate - 0.02 * h)) return null;
  return rate;
}

/**
 * Every run of candidates that follow each other (`follows`), with at most
 * two frames missed between: one for each blob no run goes on from, the
 * longest into it. Longest first. `blobs[i]` and `times[i]` are frame `i`'s;
 * `shifts[i]` lays frame `i` on frame `i - 1`.
 */
export function ballRuns(times: readonly number[], blobs: readonly Blob[][], shifts: readonly Shift[], h: number): Blob[][] {
  const nodes: Node[][] = times.map(() => []);
  const extended = new Set<Node>();
  for (let i = 0; i < times.length; i++) {
    for (const b of blobs[i] ?? []) {
      const node: Node = { blob: b, len: 1, prev: null, rate: 0 };
      let off = { dx: 0, dy: 0 };
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        off = { dx: off.dx + shifts[j + 1].dx, dy: off.dy + shifts[j + 1].dy };
        const dt = times[i] - times[j];
        if (!(dt > 0) || dt > MAX_GAP) continue;
        for (const a of nodes[j]) {
          const rate = follows(a, b, dt, h, off);
          if (rate !== null && a.len + 1 > node.len) {
            node.len = a.len + 1;
            node.prev = a;
            node.rate = rate;
          }
        }
      }
      if (node.prev) extended.add(node.prev);
      nodes[i].push(node);
    }
  }
  const ends = nodes.flat().filter((n) => n.len > 1 && !extended.has(n));
  ends.sort((p, q) => q.len - p.len);
  return ends.map((end) => {
    const chain: Blob[] = [];
    for (let n: Node | null = end; n; n = n.prev) chain.unshift(n.blob);
    return chain;
  });
}

/** How far up the picture a run rises, as a fraction of its height, the camera's movement over it taken out. */
function riseOf(run: Blob[], shifts: readonly Shift[], h: number): number {
  const first = run[0];
  const last = run[run.length - 1];
  let dy = 0;
  for (let i = first.frame + 1; i <= last.frame; i++) dy += shifts[i].dy;
  return (first.y + dy - last.y) / h;
}

/** Whether a run is the ball's (see the header). */
export function isShotRun(run: Blob[], times: readonly number[], shifts: readonly Shift[], w: number, h: number): boolean {
  if (run.length < MIN_RUN_POINTS) return false;
  const seconds = times[run[run.length - 1].frame] - times[run[0].frame];
  const across = run.reduce((s, b) => s + b.x, 0) / run.length / w;
  return (
    seconds >= MIN_RUN_SECONDS &&
    riseOf(run, shifts, h) >= MIN_RUN_RISE &&
    riseOf(run, shifts, h) <= MAX_RUN_RISE &&
    Math.abs(across - 0.5) <= RUN_OFF_CENTER &&
    slowsDown(run, times, shifts)
  );
}

/**
 * Whether a run slows in the picture as it goes up: its later steps rise no
 * faster than `SLOWING` of its earlier ones, pixels a second. The ball goes
 * away from the camera, so each foot it travels is fewer pixels than the last
 * (on shot-05's original: 0.52, 0.51, then 0.26 of the height a second); a
 * foot sliding up the approach, or a body straightening, keeps its pace or
 * gathers it (0.54, 0.67, 0.67).
 */
export const SLOWING = 0.85;
function slowsDown(run: Blob[], times: readonly number[], shifts: readonly Shift[]): boolean {
  const rates: number[] = [];
  for (let k = 1; k < run.length; k++) {
    let dy = 0;
    for (let i = run[k - 1].frame + 1; i <= run[k].frame; i++) dy += shifts[i].dy;
    rates.push((run[k - 1].y + dy - run[k].y) / (times[run[k].frame] - times[run[k - 1].frame]));
  }
  const half = Math.ceil(rates.length / 2);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return mean(rates.slice(-half)) <= SLOWING * mean(rates.slice(0, half));
}

/**
 * The pins: the first frame within `PIN_WITHIN` seconds after the run whose
 * change in a box just above the run's end (following the camera) is three
 * times the change there during the run. On the small copies.
 */
function pinsHit(small: readonly CoarseFrame[], shifts: readonly Shift[], run: Blob[], scale: number): number | null {
  const end = run[run.length - 1];
  const { width: w, height: h } = small[0];
  const ex = end.x / scale;
  const ey = end.y / scale;
  const box = {
    x0: Math.max(0, Math.round(ex - 0.1 * w)),
    x1: Math.min(w - 1, Math.round(ex + 0.1 * w)),
    y0: Math.max(0, Math.round(ey - 0.08 * h)),
    y1: Math.min(h - 1, Math.round(ey))
  };
  const energy = (i: number, off: { x: number; y: number }): number => {
    const a = small[i - 1];
    const b = small[i];
    const sx = Math.round(shifts[i].dx / scale);
    const sy = Math.round(shifts[i].dy / scale);
    let sum = 0;
    let n = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const xb = Math.round(x + off.x);
        const yb = Math.round(y + off.y);
        const xa = xb - sx;
        const ya = yb - sy;
        if (xb < 0 || yb < 0 || xb >= w || yb >= h || xa < 0 || ya < 0 || xa >= w || ya >= h) continue;
        sum += Math.abs(b.data[yb * w + xb] - a.data[ya * w + xa]);
        n++;
      }
    }
    return n ? sum / n : 0;
  };
  const during: number[] = [];
  for (let i = Math.max(1, run[0].frame); i <= end.frame; i++) during.push(energy(i, { x: 0, y: 0 }));
  during.sort((p, q) => p - q);
  const base = during[during.length >> 1];
  const off = { x: 0, y: 0 };
  // From the second frame after: the first still has the ball leaving its last place.
  for (let i = end.frame + 1; i < small.length && small[i].t - small[end.frame].t <= PIN_WITHIN; i++) {
    off.x += shifts[i].dx / scale;
    off.y += shifts[i].dy / scale;
    if (i > end.frame + 1 && energy(i, off) > Math.max(3 * base, base + 4)) return small[i].t;
  }
  return null;
}

/**
 * The height the first look's limits on the ball's pace and rise
 * (`MAX_RISE_RATE`, `MIN_RUN_RISE`, `MAX_RUN_RISE`) are fractions of: the
 * picture's own when it is a portrait phone video (where they were measured,
 * IMG_1996 and shot-05's original, 9 by 16), else what that height would be
 * at this width. A landscape video, or a clip cut from a band of a portrait
 * one (the sample clips: 42% of its height at the same width), shows the
 * ball at the same pixels a second for the same width, and judged against
 * its own short height every ball ran too fast to be one: no run passed on
 * five of the six clips, and shot-01 was "not found" in the app.
 */
export function runScale(width: number, height: number): number {
  return Math.max(height, Math.round((width * 16) / 9));
}

/** How much smaller the copies kept for the camera's movement and the pins are. */
const SMALL = 4;

/**
 * The search, a frame at a time: `push` each frame of the first look in time
 * order (all one size), then `finish`.
 */
export class ShotSearch {
  private times: number[] = [];
  private shifts: Shift[] = [];
  private blobs: Blob[][] = [];
  private small: CoarseFrame[] = [];
  private last: CoarseFrame[] = [];
  private size: { w: number; h: number } | null = null;

  push(frame: CoarseFrame): void {
    if (this.size && (frame.width !== this.size.w || frame.height !== this.size.h)) return;
    this.size ??= { w: frame.width, h: frame.height };
    const i = this.times.length;
    const small = shrink(frame, SMALL);
    let shift = { dx: 0, dy: 0 };
    if (i > 0) {
      // Coarse on the small copies, then to the pixel on the frames.
      const rough = frameShift(this.small[i - 1], small, 2, undefined, 1);
      shift = frameShift(this.last[this.last.length - 1], frame, 0, { dx: rough.dx * SMALL, dy: rough.dy * SMALL });
    }
    this.times.push(frame.t);
    this.shifts.push(shift);
    this.small.push(small);
    this.blobs.push([]);
    this.last.push(frame);
    if (this.last.length > 3) this.last.shift();
    if (this.last.length === 3) {
      const [prev, cur, next] = this.last;
      // shifts[i - 1] lays the middle frame on the one before; its inverse the other way.
      const s = this.shifts[i - 1];
      this.blobs[i - 1] = candidatesOn(prev, cur, next, { dx: -s.dx, dy: -s.dy }, shift, i - 1);
    }
  }

  finish(): ShotFound | null {
    if (!this.size || this.times.length < MIN_RUN_POINTS + 2) return null;
    const { w } = this.size;
    // The ball's pace and rise are judged against the height it has in a
    // portrait phone video (`runScale`), not the picture's own.
    const h = runScale(w, this.size.h);
    const all = ballRuns(this.times, this.blobs, this.shifts, h);
    const shot = new Set(all.filter((r) => isShotRun(r, this.times, this.shifts, w, h)));
    // No run passes for the ball's: the longest of three points or more,
    // flagged, for the lane to judge (IMG_1996: one look in four).
    const guessed = shot.size === 0;
    const runs = guessed ? all.filter((r) => r.length >= OTHER_RUN_POINTS) : all.filter((r) => shot.has(r));
    if (!runs.length) return null;
    // The longest; of those as long, the last to start. Before the ball's
    // run the bowler's slide or swing can pass for one, as long; after it the
    // follow-through and the walk back are shorter (four looks at shot-05's
    // original in Chromium: the ball's run had 4 to 7 points, the slide 4 or 5,
    // the follow-through 4).
    const ranked = [...runs].sort((a, b) => b.length - a.length || b[0].frame - a[0].frame);
    const run = ranked[0];
    const release = this.times[run[0].frame];
    const pinHit = pinsHit(this.small, this.shifts, run, SMALL);
    const rise = riseOf(run, this.shifts, h);
    const confidence = Math.min(1, Math.min(1, run.length / 12) * 0.5 + Math.min(1, rise / 0.15) * 0.3 + (pinHit !== null ? 0.2 : 0));
    return {
      start: Math.max(0, release - LEAD_SECONDS),
      release,
      pinHit,
      confidence,
      run: this.points(run),
      others: (guessed ? ranked.slice(1) : [...ranked.slice(1), ...all.filter((r) => !shot.has(r) && r.length >= OTHER_RUN_POINTS)])
        .slice(0, OTHER_RUNS)
        .map((r) => this.points(r)),
      ...(guessed ? { guessed: true } : {})
    };
  }

  /** A run as the first look reports it: seconds and picture fractions. */
  private points(run: Blob[]): RunPoint[] {
    const { w, h } = this.size!;
    return run.map((b) => ({ t: this.times[b.frame], x: b.x / w, y: b.y / h }));
  }
}

/** `ShotSearch` over frames already read. */
export function findShot(frames: readonly CoarseFrame[]): ShotFound | null {
  const search = new ShotSearch();
  for (const f of frames) search.push(f);
  return search.finish();
}

/**
 * The band of a portrait picture (top and bottom, fractions of its height)
 * the lane is in, for the full read to keep at close to the video's own
 * scale: from 30% of the height above where the run starts (the pins, the
 * masking units above them) to 14% below it (the foul line and the
 * approach), as the sample clips were cut from the owner's originals (30% to
 * 72% of the height, the foul line at 57 to 64% and the run's start just
 * below or above it). Without a run, the clips' own band. A landscape
 * picture is read whole (null).
 */
export const BAND_ABOVE = 0.3;
export const BAND_BELOW = 0.14;
export const DEFAULT_BAND = { top: 0.3, bottom: 0.72 };

export interface Band {
  top: number;
  bottom: number;
}

export function laneBand(width: number, height: number, found: ShotFound | null): Band | null {
  if (!(height > width)) return null;
  if (!found?.run.length) return DEFAULT_BAND;
  const at = found.run[0].y;
  let top = at - BAND_ABOVE;
  let bottom = at + BAND_BELOW;
  // Inside the picture, keeping its height.
  if (top < 0) {
    bottom -= top;
    top = 0;
  }
  if (bottom > 1) {
    top -= bottom - 1;
    bottom = 1;
  }
  return { top: Math.max(0, top), bottom: Math.min(1, bottom) };
}

/**
 * A video no longer than this, seconds, is read whole when no shot is found
 * in it: a shot and a little more. A longer one is not guessed at.
 */
export const SHORT_VIDEO = 5;

/**
 * Where the full read of a video `duration` seconds long starts: a little
 * before the release when the shot was found, the start of a short video
 * when it was not, and null for a long one with no shot found. Where it ends
 * is `shotWindow` (`shotWindow.ts`): when the ball has left the deck.
 */
export function readFrom(duration: number, found: ShotFound | null): number | null {
  if (found) return found.start;
  return !(duration > SHORT_VIDEO) ? 0 : null;
}

/**
 * The bands of the picture to look for the lane in, in turn: the sample
 * clips' own, which the tracer was tuned on, then the run's (`laneBand`)
 * when it is not much the same. On shot-05's original the run's band (33% to
 * 77%) read the laydown 23.1 and the clips' band 18.7, as the harness reads
 * it. The run is often the bowler's approach rather than the ball, and then
 * its band is too low: tried first, it cost a read on most looks at IMG_1996,
 * and which band was read depended on which run the look chose. The lane
 * finder on the first part of the read is the judge (`readShot.ts`). A
 * landscape picture is read whole.
 */
export function laneBands(width: number, height: number, found: ShotFound | null): (Band | null)[] {
  const first = laneBand(width, height, found);
  if (!first) return [null];
  const shared = Math.min(first.bottom, DEFAULT_BAND.bottom) - Math.max(first.top, DEFAULT_BAND.top);
  return shared >= 0.8 * (DEFAULT_BAND.bottom - DEFAULT_BAND.top) ? [DEFAULT_BAND] : [DEFAULT_BAND, first];
}
