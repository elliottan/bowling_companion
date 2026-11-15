import { apply, invert, multiply, normalize, solveHomography } from "./homography";
import { median } from "./image";
import { BACK_ROW_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { Mat3, Point } from "./types";

/**
 * The lane on every frame from the lane found on some of them (the shot
 * tracer's per-frame calibration; scripts/shot-tracker/README.md, "Per-frame
 * lanes").
 *
 * The finder (`findLanes`) calibrates the lane on a frame in a third of a
 * second with no hands, so it is found on many frames of a clip instead of
 * one. Each frame then takes the lane from the found frames near it, each
 * carried to it by the picture's registration over a few frames only: on a
 * hand-held phone the registration drifts over a hundred frames, and one
 * calibration carried through the whole clip moved the readings by boards
 * with the frame it was made on.
 *
 * A single frame's lane is noisy (a leg over an edge, a pin row read off a
 * reflection), but the lane itself does not move: carried to a common frame,
 * the found lanes should agree, and one that does not is dropped. The rest
 * are blended with weights that fall off with their distance in frames, as
 * the positions they give a grid of lane points, refitted as one homography.
 */

/** The lane as found on one frame. */
export interface FrameLane {
  /** The clip's frame index the lane was found on. */
  frame: number;
  /** Lane (u boards, v feet) to that frame's pixels. */
  H: Mat3;
  /** Relative trust (the finder's quality); 1 when not given. */
  weight?: number;
  /** Not wholly measured: a hidden line was filled in (see `LaneFound.guess`). */
  guess?: boolean;
}

export interface LaneTrackOptions {
  /** Found frames further than this many frames away count for e^-2 as much (a Gaussian of this width over two). */
  reach?: number;
  /** The found lane that says which lane is the bowler's (its frame): the one with the most weight unless given. */
  anchor?: number;
  /** Two found lanes agree when, carried to one frame, they are within this many boards at every corner... */
  outlierBoards?: number;
  /** ...and this many feet along the lane at the foul line and the pin row. */
  outlierFeet?: number;
}

/** How far apart two mappings of the same frame put the lane: boards across and feet along, the worst of the four corners. */
export function laneDisagreement(A: Mat3, B: Mat3): { boards: number; feet: number } {
  const back = invert(B);
  let boards = 0;
  let feet = 0;
  for (const u of [LEFT_U, RIGHT_U]) {
    for (const v of [0, BACK_ROW_FT]) {
      const q = apply(back, apply(A, { x: u, y: v }));
      boards = Math.max(boards, Math.abs(q.x - u));
      feet = Math.max(feet, Math.abs(q.y - v));
    }
  }
  return { boards, feet };
}

/** A found lane further than this from the anchor's, carried to its frame, is another lane, boards (lanes are 40 or more apart; the registration over a whole clip can be a few out). */
export const SAME_LANE_BOARDS = 12;

/** Each found lane is checked against this many of the found lanes nearest it in time. */
const NEIGHBORS = 8;

/** Lane points the blend is taken over: across the lane, from the foul line to the pin row. */
const GRID: Point[] = [];
for (const u of [LEFT_U, 10, 20, 30, RIGHT_U]) for (const v of [0, 10, 20, 30, 40, 50, BACK_ROW_FT]) GRID.push({ x: u, y: v });

/**
 * The weighted blend of mappings of one frame, as the homography nearest the
 * mean picture position each gives every grid point. Null with nothing to blend.
 */
export function blendLanes(maps: { H: Mat3; w: number }[]): Mat3 | null {
  const use = maps.filter((m) => m.w > 0 && m.H.every(Number.isFinite));
  if (!use.length) return null;
  if (use.length === 1) return normalize(use[0].H);
  const total = use.reduce((s, m) => s + m.w, 0);
  const dst = GRID.map((p) => {
    let x = 0;
    let y = 0;
    for (const m of use) {
      const q = apply(m.H, p);
      x += m.w * q.x;
      y += m.w * q.y;
    }
    return { x: x / total, y: y / total };
  });
  return solveHomography(GRID, dst);
}

export interface LaneTrack {
  /** The lane mapping per frame (frames nothing could be carried to are left out). */
  H: Map<number, Mat3>;
  kept: FrameLane[];
  /** Found lanes left out as disagreeing with the rest. */
  dropped: FrameLane[];
  /** Each found lane against its nearest others: how many it agrees with, and the median disagreement (NaN: none to check against). */
  checks: { frame: number; agree: number; boards: number; feet: number }[];
}

/**
 * The lane on each of `frames`, from the lanes found on some frames.
 * `carry(from, to)` is the picture's transform from one frame's pixels to
 * another's (registration), null where it is not known. Returns the mapping
 * per frame (frames nothing could be carried to are left out), and which found
 * lanes were kept and which dropped as disagreeing with the rest.
 */
export function laneTrack(
  lanes: FrameLane[],
  carry: (from: number, to: number) => Mat3 | null,
  frames: number[],
  opts: LaneTrackOptions = {}
): LaneTrack {
  const reach = opts.reach ?? 15;
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const outB = opts.outlierBoards ?? 1;
  const outF = opts.outlierFeet ?? 1.5;
  const blendAt = (k: number, from: FrameLane[]) => {
    const near = from.flatMap((l) => {
      const S = l.frame === k ? I : carry(l.frame, k);
      return S ? [{ l, H: normalize(multiply(S, l.H)), e: 0.5 * ((2 * (k - l.frame)) / reach) ** 2 }] : [];
    });
    // Relative to the nearest, so a frame far from every found one still has weights.
    const e0 = Math.min(...near.map((n) => n.e));
    return blendLanes(near.map((n) => ({ H: n.H, w: (n.l.weight ?? 1) * (n.l.guess ? 0.25 : 1) * Math.exp(e0 - n.e) })));
  };
  // Each found lane against its nearest few others, one at a time, each
  // carried to its frame: how many of them it agrees with. On some frames the
  // finder takes the next lane (shot-01: three frames in a row near the end),
  // so a plain median of the disagreements fails where wrong and right are
  // half and half; the count does not. A lane is kept when it agrees with at
  // least two others and with more than half as many as the best-agreeing lane near it.
  const finite = lanes.filter((l) => l.H.every(Number.isFinite));
  // Which lane is the bowler's is the anchor's to say (the finder's best
  // frame): on shot-03 the finder took the next lane on the first 200 frames
  // of 280 and the bowler's on the rest, so no count of agreeing frames can
  // tell. A lane that is not the anchor's, carried to its frame, is dropped,
  // and so is one that cannot be carried there to be checked.
  const anchor = opts.anchor !== undefined
    ? finite.find((l) => l.frame === opts.anchor)
    : finite.reduce<FrameLane | undefined>((a, l) => (!a || (l.weight ?? 1) > (a.weight ?? 1) ? l : a), undefined);
  const all = anchor
    ? finite.filter((l) => {
        if (l === anchor) return true;
        const S = l.frame === anchor.frame ? I : carry(l.frame, anchor.frame);
        return !!S && laneDisagreement(anchor.H, normalize(multiply(S, l.H))).boards <= SAME_LANE_BOARDS;
      })
    : finite;
  const nearest = (l: FrameLane) => all.filter((o) => o !== l).sort((x, y) => Math.abs(x.frame - l.frame) - Math.abs(y.frame - l.frame)).slice(0, NEIGHBORS);
  const checks = all.map((l) => {
    const d = nearest(l).flatMap((o) => {
      const S = o.frame === l.frame ? I : carry(o.frame, l.frame);
      return S ? [laneDisagreement(l.H, normalize(multiply(S, o.H)))] : [];
    });
    return {
      frame: l.frame,
      agree: d.filter((x) => x.boards <= outB && x.feet <= outF).length,
      boards: d.length ? median(d.map((x) => x.boards)) : NaN,
      feet: d.length ? median(d.map((x) => x.feet)) : NaN
    };
  });
  const agreeOf = new Map(all.map((l, i) => [l, checks[i].agree]));
  let kept = all.filter((l, i) => {
    const best = Math.max(checks[i].agree, ...nearest(l).map((o) => agreeOf.get(o)!));
    // A lane nothing could be carried to cannot be checked, and is kept.
    return Number.isNaN(checks[i].boards) || (checks[i].agree >= Math.min(2, best) && checks[i].agree > 0.5 * best);
  });
  if (!kept.length) kept = all;
  const dropped = lanes.filter((l) => !kept.includes(l));
  const H = new Map<number, Mat3>();
  for (const k of frames) {
    const h = blendAt(k, kept);
    if (h) H.set(k, h);
  }
  return { H, kept, dropped, checks };
}
