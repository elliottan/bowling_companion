import { ARC_MIN, arcFit } from "./ballDetect";
import { apply, downAt } from "./homography";
import { contactPoint } from "./laneModel";
import { median, sample } from "./image";
import type { GrayFrame, Mat3, Point } from "./types";
import * as fdlibm from "./detMath";

/**
 * The ball found again after a long stretch unseen (2026-11-22, IMG_0047:
 * the bowler's body and arm cover the ball from 26 ft until just before it
 * reaches the pins, and stand in the empty lane where the ball rolls).
 *
 * The change against the empty lane cannot show it there: a bowler who holds
 * the finish in front of the rack is in the empty lane, so the dark ball in
 * front of the pins differs from nothing (the empty lane is dark there too),
 * and the pins the bowler has stepped away from are all change. The frame
 * itself still shows it plainly: a dark disk of the ball's size with the
 * bright deck or pins round it. So after the gap, in the frames the ball's
 * own pace puts it between its last sighting and the pins, the lane is
 * searched for that disk (`darkDisk`, `gapCandidates`), anything as dark at
 * the same spot before the ball could be there is dropped (`stillDark`), and
 * the candidates one ball can have made, with a steady pace across, are kept
 * (`gapTrack`). Pure.
 */

/** A disk's inside against its ring: the ring's samples brighter than the inside by this, grey levels, count as bright. */
export const DISK_CONTRAST = 30;
/** The share of the ring (its lower side left out) that must be bright round a ball. */
export const RING_BRIGHT = 0.75;
/** The most of a disk's inside that may be as bright (a ball's highlight); more is the lane showing through. */
export const INNER_LIT = 0.15;
/** The ring's radius, in ball radii. */
export const RING_K = 1.5;

export interface DiskLook {
  /** Mean grey inside 0.7 of the radius. */
  inner: number;
  /** Median grey on the ring. */
  ring: number;
  /** Share of the ring's samples brighter than `inner` by `DISK_CONTRAST`. */
  bright: number;
  /** Share of the inside's samples as bright: the lane showing inside a disk that is not on the ball. */
  lit: number;
}

/**
 * How dark a disk of radius `r` at `c` is against what is round it. The
 * ring's lower side (within about 55 degrees of `down`) is left out: on a
 * glossy deck the ball's mirror image hangs there. Null when part of it is
 * outside the picture.
 */
export function darkDisk(f: GrayFrame, c: Point, r: number, down: Point): DiskLook | null {
  const R = 0.7 * r;
  const inside: number[] = [];
  const step = Math.max(0.5, R / 4);
  for (let j = -R; j <= R + 1e-9; j += step) {
    for (let i = -R; i <= R + 1e-9; i += step) {
      if (i * i + j * j > R * R) continue;
      const v = sample(f, c.x + i, c.y + j);
      if (!Number.isFinite(v)) return null;
      inside.push(v);
    }
  }
  if (!inside.length) return null;
  const inner = inside.reduce((a, b) => a + b, 0) / inside.length;
  const ring: number[] = [];
  for (let a = 0; a < 24; a++) {
    const th = (2 * Math.PI * a) / 24;
    const dx = fdlibm.cos(th);
    const dy = fdlibm.sin(th);
    if (dx * down.x + dy * down.y > 0.57) continue;
    const v = sample(f, c.x + RING_K * r * dx, c.y + RING_K * r * dy);
    if (!Number.isFinite(v)) return null;
    ring.push(v);
  }
  const bright = ring.filter((v) => v >= inner + DISK_CONTRAST).length / ring.length;
  const lit = inside.filter((v) => v >= inner + DISK_CONTRAST).length / inside.length;
  return { inner, ring: median(ring), bright, lit };
}

/** A disk's look as a score: the ring's bright share times its contrast; 0 when it is not a ball's. */
export function diskScore(d: DiskLook | null): number {
  if (!d || d.bright < RING_BRIGHT || d.lit > INNER_LIT || d.ring - d.inner < DISK_CONTRAST) return 0;
  return d.bright * (d.ring - d.inner);
}

export interface GapCandidate {
  frame: number;
  t: number;
  /** The disk's center and radius in the frame's pixels. */
  cx: number;
  cy: number;
  r: number;
  /** Lane position of the point under it. */
  u: number;
  v: number;
  score: number;
  /** Mean grey inside the disk (`DiskLook.inner`). */
  inner: number;
}

/** How many candidates a frame keeps, best first. */
export const PER_FRAME = 3;

/**
 * The dark disks of the ball's size on one frame, with the point under them
 * between `vLo` and `vHi` feet and `uLo` and `uHi` across: the lane is
 * stepped half a board and half a foot, each point's disk is the ball's
 * (`radius`) standing on it, and the best few that do not overlap are kept.
 */
export function gapCandidates(
  f: GrayFrame, H: Mat3, frame: number, vLo: number, vHi: number, uLo: number, uHi: number, radius: (u: number, v: number) => number
): GapCandidate[] {
  const all: GapCandidate[] = [];
  for (let v = vLo; v <= vHi + 1e-9; v += 0.5) {
    for (let u = uLo; u <= uHi + 1e-9; u += 0.5) {
      const r = radius(u, v);
      if (!(r >= 2)) continue;
      const p = apply(H, { x: u, y: v });
      const down = downAt(H, p);
      const c = { x: p.x - r * down.x, y: p.y - r * down.y };
      const look = darkDisk(f, c, r, down);
      const score = diskScore(look);
      if (score > 0) all.push({ frame, t: f.t, cx: c.x, cy: c.y, r, u, v, score, inner: look!.inner });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const kept: GapCandidate[] = [];
  for (const c of all) {
    if (kept.length >= PER_FRAME) break;
    if (kept.some((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) < 1.5 * Math.max(k.r, c.r))) continue;
    kept.push(c);
  }
  return kept;
}

/**
 * Whether the same spot on the lane is as dark on every reference frame,
 * taken before the ball could be there: a dark mark, a gap between pins
 * against the pit, never the ball. One reference that shows the spot
 * brighter than the disk by `DISK_CONTRAST` is enough to clear it (the
 * bowler may cover it on the others). No references clear nothing.
 */
export function stillDark(c: GapCandidate, refs: { f: GrayFrame; H: Mat3 }[], radius: (H: Mat3, u: number, v: number) => number): boolean {
  if (!refs.length) return false;
  return !refs.some(({ f, H }) => {
    const r = radius(H, c.u, c.v);
    const p = apply(H, { x: c.u, y: c.v });
    const down = downAt(H, p);
    const d = darkDisk(f, { x: p.x - r * down.x, y: p.y - r * down.y }, r, down);
    return d !== null && d.inner >= c.inner + DISK_CONTRAST;
  });
}

/** Fewest candidates a track found again is made of. */
export const MIN_GAP_TRACK = 4;
/** Fastest the ball moves across, boards a second (about 7 degrees at 26 mph), plus a board for a candidate's own error. */
export const MAX_ACROSS_BPS = 40;
/** Two candidates further apart in time than this, seconds, are not linked: the ball may be covered between them, not for longer. */
export const LINK_S = 0.5;
/** Down the lane a candidate may sit this many feet off where the ball's pace puts it from the one before (far down the lane a pixel is a foot). */
export const LINK_SLACK_FT = 3;

/**
 * The candidates one ball can have made, in time order: each linked to the
 * one before when no more than `LINK_S` later, on another frame, no further
 * across than the ball can move in the time (`MAX_ACROSS_BPS`), and down the
 * lane neither back nor further on than `speed` takes it (`LINK_SLACK_FT`
 * either way). The chain with the most score of at least `MIN_GAP_TRACK`
 * candidates, or none. A ball that hooks turns across over the gap, so
 * this is a chain of steps, not one line.
 */
export function gapTrack(cands: GapCandidate[], speed: number): GapCandidate[] {
  const c = [...cands].sort((a, b) => a.t - b.t || a.frame - b.frame || b.score - a.score);
  const total = c.map((x) => x.score);
  const count = c.map(() => 1);
  const prev = c.map(() => -1);
  for (let i = 0; i < c.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = c[j];
      const b = c[i];
      const dt = b.t - a.t;
      if (!(dt > 0) || dt > LINK_S || a.frame === b.frame) continue;
      if (Math.abs(b.u - a.u) > 1 + MAX_ACROSS_BPS * dt) continue;
      if (b.v < a.v - LINK_SLACK_FT || b.v > a.v + speed * dt + LINK_SLACK_FT) continue;
      if (total[j] + b.score > total[i]) {
        total[i] = total[j] + b.score;
        count[i] = count[j] + 1;
        prev[i] = j;
      }
    }
  }
  let end = -1;
  for (let i = 0; i < c.length; i++) if (count[i] >= MIN_GAP_TRACK && (end < 0 || total[i] > total[end])) end = i;
  const out: GapCandidate[] = [];
  for (let i = end; i >= 0; i = prev[i]) out.push(c[i]);
  return out.reverse();
}

export interface GapSearch {
  /** The frames after the last sighting, in order, each with its lane mapping (null: not steadied). */
  frames: { index: number; f: GrayFrame | null; H: Mat3 | null }[];
  /** Reference frames from before the ball could be past its last sighting. */
  refs: { f: GrayFrame; H: Mat3 }[];
  /** Where the ball was last seen: feet, lane u, seconds, and its pace there, feet a second. */
  last: { v: number; u: number; t: number; speed: number };
  /** The ball's radius in a frame's pixels standing at (u, v). */
  radius: (H: Mat3, u: number, v: number) => number;
}

/** Feet down the lane the search ends at: the head pin's front. */
export const GAP_TO_FT = 60;
/** The ball keeps at least this share of its pace over the gap... */
export const GAP_SLOW = 0.75;
/** ...and none more; give or take this many feet. */
export const GAP_SLACK = 3;
/** Most boards a ball moves across per foot down the lane, on average over the gap. */
export const MAX_SWING_PER_FT = 0.45;
/** A track found again goes down the lane, over its whole time, at no less than this share of the ball's pace... */
export const TRACK_PACE: [number, number] = [0.5, 1.3];

/**
 * The ball found again past its last sighting (`last`): on each frame, the
 * stretch of lane its pace puts it on (no faster than it was, no slower than
 * `GAP_SLOW` of that, `GAP_SLACK` either way), to the pins, across no
 * further from where it was than `MAX_SWING_PER_FT` a foot allows; the dark
 * disks there not as dark before (`stillDark`), each placed by its rim where
 * enough of it shows (`arcFit`, the upper side), and one ball's chain
 * through them (`gapTrack`) going down the lane at its pace (`paceHolds`).
 */
export function findAfterGap(s: GapSearch): GapCandidate[] {
  const { last } = s;
  if (!(last.speed > 0) || last.v >= GAP_TO_FT) return [];
  const all: GapCandidate[] = [];
  for (const fr of s.frames) {
    if (!fr.f || !fr.H) continue;
    const dt = fr.f.t - last.t;
    if (dt <= 0) continue;
    const vHi = Math.min(GAP_TO_FT + 0.5, last.v + last.speed * dt + GAP_SLACK);
    const vLo = Math.max(last.v, last.v + GAP_SLOW * last.speed * dt - GAP_SLACK);
    if (vLo > vHi) continue;
    const swing = 1 + MAX_SWING_PER_FT * (vHi - last.v);
    const uLo = Math.max(-0.5, last.u - swing);
    const uHi = Math.min(40.5, last.u + swing);
    const H = fr.H;
    const f = fr.f;
    for (const c of gapCandidates(f, H, fr.index, vLo, vHi, uLo, uHi, (u, v) => s.radius(H, u, v))) {
      if (stillDark(c, s.refs, s.radius)) continue;
      all.push(placeByRim(f, H, c));
    }
  }
  const track = gapTrack(all, last.speed);
  return paceHolds(track, last.speed) ? track : [];
}

/**
 * Whether a track goes down the lane at the ball's pace (`TRACK_PACE`, by a
 * straight line in time through it): the links of a chain may each give a
 * little back, and a chain of them crawl along the rack or across it
 * (shot-04: a pin's edge moving across the bowler's arm, 49 ft down to 47).
 */
export function paceHolds(track: GapCandidate[], speed: number): boolean {
  if (track.length < 2) return false;
  const n = track.length;
  const mt = track.reduce((s, c) => s + c.t, 0) / n;
  const mv = track.reduce((s, c) => s + c.v, 0) / n;
  const den = track.reduce((s, c) => s + (c.t - mt) ** 2, 0);
  if (!(den > 0)) return false;
  const pace = track.reduce((s, c) => s + (c.t - mt) * (c.v - mv), 0) / den;
  return pace >= TRACK_PACE[0] * speed && pace <= TRACK_PACE[1] * speed;
}

/** A candidate placed again by the rim that shows round it (`arcFit`), and its lane position from there; as it was when too little shows. */
export function placeByRim(f: GrayFrame, H: Mat3, c: GapCandidate): GapCandidate {
  const at = { x: c.cx, y: c.cy };
  const a = arcFit(f, downAt(H, at), at, c.r, 0.5 * c.r);
  if (!a || a.support < ARC_MIN) return c;
  const cp = contactPoint(H, { x: a.cx, y: a.cy }, c.r);
  return { ...c, cx: a.cx, cy: a.cy, u: cp.u, v: cp.v };
}
