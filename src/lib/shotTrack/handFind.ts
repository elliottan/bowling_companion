import type { Handedness } from "../../types/bowling";
import type { Background, Roi } from "./background";
import { apply } from "./homography";
import { CENTER_U, LEFT_U, RIGHT_U, expectedRadiusPx, imageToLane } from "./laneModel";
import type { GrayFrame, Mat3, PathModel } from "./types";

/**
 * Which hand threw the ball, from the video alone (the owner, 2026-11-19: the
 * tracer works with no input from the bowler, and a phone's owner films other
 * bowlers too, so the app's handedness setting cannot say whose shot it is).
 *
 * Everything here is in lane u: boards from the left edge as seen from the
 * foul line (`laneModel.ts`), so a right-hander's own gutter is at high u.
 * Each cue votes from -1 (left-handed) to +1 (right-handed), from things true
 * of bowling:
 *
 * - `release`: at the release the ball is outside the slide foot on the
 *   throwing arm's side, and the bowler's body (slide leg, trailing leg swept
 *   behind, the other arm out for balance) is on the other side of it. Seen
 *   from behind, a right-hander's ball is to the right of the body.
 * - `drift`: from the foul line to the arrows the ball moves out toward the
 *   bowler's own gutter, or holds its board: a right-hander's moves right.
 * - `hook`: past the breakpoint the ball turns back toward the middle: a
 *   right-hander's turns left.
 * - `pins`: a right-hander's pocket is the 1-3, right of the head pin; a
 *   left-hander's the 1-2, left of it.
 * - `line`: the side of the lane the ball crosses the arrows on. A
 *   right-hander plays the right half (arrows boards 5 to 20 from the right
 *   gutter on almost every shot, 25 when deep inside), a left-hander the
 *   left (2026-11-20: a left-hander's ball up board 11 from the left, with no
 *   release seen and no hook yet, was left to the app's setting).
 *
 * Together they always decide the hand (`decideHand`, the owner: no input
 * from the bowler); the app's setting stands only when no cue can be read.
 */

export type HandCueName = "release" | "drift" | "hook" | "pins" | "line";

export interface HandCue {
  name: HandCueName;
  /** -1 (left-handed) to +1 (right-handed). */
  vote: number;
  /** What was measured, boards: the ball right of the body, the move right to the arrows, the turn right past the bend, or right of the head pin. */
  boards: number;
}

export interface HandFound {
  hand: Handedness;
  /** `video` when the cues decided it, `setting` when no cue could be read and the app's setting was kept. */
  by: "video" | "setting";
  /** With `video`, for the details: the cues said little (`weak`), or one voted strongly against the rest (`disagree`). */
  why?: "weak" | "disagree";
  /** 0 to 1: how much of the cues' weight agrees with the hand found. */
  confidence: number;
  cues: HandCue[];
}

/**
 * How much each cue counts. The release counts most: it is the only one that
 * does not depend on where the bowler aimed. The line counts as much as the
 * drift: where the ball is on the lane is plain on any video, small or not.
 * The hook and the pins count least: a hook is read off the far end, a few
 * pixels on a small video, where a bend of the fitted path can be the lane's
 * mapping or the camera's pan rather than the ball (2026-11-20: the owner's
 * left-hander up board 11, no release seen, read a bend to the left past the
 * arrows); a missed pocket (a Brooklyn, a light hit far out) lands on the
 * other side of the head pin.
 */
const WEIGHT: Record<HandCueName, number> = { release: 1.5, drift: 1, line: 1, hook: 0.6, pins: 0.6 };

/** Under this much, in weighted votes, the hand is still the video's but marked weak in the details. */
export const HAND_EVIDENCE = 0.6;

/** A cue voting at least this much against the rest marks the hand as disagreed in the details. */
export const HAND_DISSENT = 0.5;

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/** The ball `ballU` and the bowler's body `bodyU` at the release; the body is weighed in only when it was seen clearly enough to place. */
export function releaseCue(ballU: number, bodyU: number): HandCue {
  const boards = ballU - bodyU;
  return { name: "release", vote: clamp(boards / 4), boards };
}

/** A pixel counts as the bowler when it differs from the empty lane by this much, gray levels, and by this many times its own spread. */
export const BODY_CHANGE = 25;
export const BODY_SPREAD = 4;

/** The body must cover at least this share of a lane width squared in the picture to be placed. */
export const BODY_MIN_AREA = 0.05;

/**
 * Where the bowler's body is at the release, in lane u at the foul line: the
 * middle of the picture's change against the empty lane in a box over the
 * foul line (a lane width and a half up, half a lane width down, half a lane
 * width past either edge), leaving out the ball and a ball's width round it.
 * `frame` is steadied onto the empty lane `bg` (both in the calibration
 * frame's pixels, over `roi`); `H` maps the lane into those pixels. Null when
 * too little of a body shows (the bowler is in the empty lane too: standing
 * still for most of the read).
 */
export function bodyAtRelease(frame: GrayFrame, bg: Background, roi: Roi, H: Mat3, ballU: number): number | null {
  const left = apply(H, { x: LEFT_U, y: 0 });
  const right = apply(H, { x: RIGHT_U, y: 0 });
  const w = right.x - left.x;
  if (!(w > 4)) return null;
  const foulY = (left.y + right.y) / 2;
  const ball = apply(H, { x: ballU, y: 0 });
  const r = expectedRadiusPx(H, ballU, 0);
  const bx = ball.x;
  const by = ball.y - r;
  const keep = 2 * r;
  const y0 = Math.max(roi.y0, Math.floor(foulY - 1.5 * w));
  const y1 = Math.min(roi.y0 + roi.height - 1, Math.ceil(foulY + 0.5 * w));
  const x0 = Math.max(roi.x0, Math.floor(left.x - 0.5 * w));
  const x1 = Math.min(roi.x0 + roi.width - 1, Math.ceil(right.x + 0.5 * w));
  let n = 0;
  let sx = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - bx) ** 2 + (y - by) ** 2 <= keep * keep) continue;
      const i = (y - roi.y0) * roi.width + (x - roi.x0);
      const b = bg.data[i];
      const v = frame.data[i];
      if (!Number.isFinite(b) || !Number.isFinite(v)) continue;
      const d = Math.abs(v - b);
      if (d < BODY_CHANGE || d < BODY_SPREAD * bg.spread[i]) continue;
      n++;
      sx += x;
    }
  }
  if (n < BODY_MIN_AREA * w * w) return null;
  return imageToLane(H, { x: sx / n, y: foulY }).u;
}

/** The ball's board over the foul line and at the arrows (15 ft). */
export function driftCue(atFoul: number, atArrows: number): HandCue {
  const boards = atArrows - atFoul;
  return { name: "drift", vote: clamp(boards / 3), boards };
}

/**
 * The turn of a fitted hook, when the sightings run past the middle of its
 * bend (`seenTo`, feet): how far the ball ends right of where its skid would
 * have taken it by 60 ft. Null for a straight path, a bend not seen, or a
 * path fitted loosely (`rough`: its bend can be the noise).
 */
export function hookCue(path: PathModel, seenTo: number): HandCue | null {
  if (path.kind !== "hook" || path.rough || !(path.L > 0) || seenTo < path.s + path.L / 2) return null;
  const after = Math.max(0, 60 - path.s - path.L);
  const boards = path.k * path.L * path.L + 2 * path.k * path.L * after;
  return { name: "hook", vote: clamp(-boards / 4), boards: -boards };
}

/**
 * The ball's lane u at the arrows: right of the middle is a right-hander's
 * half. A full vote 8 boards from the middle (arrows board 12 from either
 * gutter); a right-hander deep inside at board 25 votes -0.6, which a
 * release or a drift out to the right outvotes.
 */
export function lineCue(atArrows: number): HandCue | null {
  if (!(atArrows >= LEFT_U && atArrows <= RIGHT_U)) return null;
  const boards = atArrows - CENTER_U;
  return { name: "line", vote: clamp(boards / 8), boards };
}

/**
 * The hook cue, unless the path's bend turns the same way the ball drifted
 * to the arrows: a hook turns back against the drift (a right-hander's ball
 * goes out right, then turns left), so a bend that carries the drift on is
 * the fit following noise or the camera, not a hook, and is left out.
 */
export function hookAgainstDrift(hook: HandCue | null, drift: HandCue | null): HandCue | null {
  if (!hook || !drift || Math.abs(drift.boards) < 1) return hook;
  return hook.vote * drift.vote < 0 ? null : hook;
}

/** The ball's lane u where it meets the pins: right of the head pin is a right-hander's pocket. */
export function pinsCue(u: number): HandCue | null {
  if (!(u >= LEFT_U && u <= RIGHT_U)) return null;
  const boards = u - CENTER_U;
  return { name: "pins", vote: clamp(boards / 3), boards };
}

/**
 * A release cue with the ball at least this far, boards, to one side of the
 * body's middle decides the hand on its own (`decideHand`). Half a ball's
 * width and more: a body's middle is never that far on the ball's wrong side.
 * The twenty inputs read 7 to 16 boards, shot-01 2.7.
 */
export const RELEASE_CLEAR = 6;

/**
 * The hand from the cues seen: the side the weighted votes come down on,
 * however little they say (the owner, 2026-11-20: "It should be obvious from
 * the video"). A strong cue against the rest is outvoted, and the details say
 * so (`why`), except a clear release (`RELEASE_CLEAR`): the ball beside the
 * body is the one cue that holds whatever the bowler aimed at and wherever
 * the lane was drawn (the picture's left and right survive a lane mapping a
 * gutter or more out), while the drift, the line, the hook and the pins are
 * all read in the found lane's boards and turn with it (2026-11-24: on
 * IMG_5853 a lane that ran out over the ball return put a right-hander's
 * ball on the left half). The app's setting stands only with no cue at all,
 * or votes that cancel exactly. The confidence is the weighted share of the
 * votes on the side found.
 */
export function decideHand(cues: HandCue[], setting: Handedness): HandFound {
  let sum = 0;
  let total = 0;
  for (const c of cues) {
    sum += WEIGHT[c.name] * c.vote;
    total += WEIGHT[c.name] * Math.abs(c.vote);
  }
  const release = cues.find((c) => c.name === "release" && Math.abs(c.boards) >= RELEASE_CLEAR);
  if (release && release.vote * sum <= 0) {
    const side = Math.sign(release.vote);
    return { hand: side > 0 ? "right" : "left", by: "video", why: "disagree", confidence: (side * sum + total) / (2 * total), cues };
  }
  if (sum === 0) return { hand: setting, by: "setting", confidence: 0, cues };
  const side = sum > 0 ? 1 : -1;
  const confidence = (side * sum + total) / (2 * total);
  const hand: Handedness = side > 0 ? "right" : "left";
  const why = cues.some((c) => c.vote * side <= -HAND_DISSENT) ? "disagree" : Math.abs(sum) < HAND_EVIDENCE ? "weak" : undefined;
  return why ? { hand, by: "video", why, confidence, cues } : { hand, by: "video", confidence, cues };
}

/** The other hand. */
export const otherHand = (h: Handedness): Handedness => (h === "right" ? "left" : "right");

/** The hand found and its cues, for the details block (technical English, as `notes.ts`). */
export function handNote(f: HandFound): string {
  const cues = f.cues.map((c) => `${c.name} ${c.boards.toFixed(1)} boards (${c.vote >= 0 ? "+" : ""}${c.vote.toFixed(2)})`).join(", ");
  const how = f.by === "setting" ? "from the setting, no cue in the video" : f.why === "disagree" ? "from the video, a cue against the rest" : f.why === "weak" ? "from the video, the cues weak" : "from the video";
  return `${f.hand} ${how}, confidence ${f.confidence.toFixed(2)}; ${cues || "no cues"}`;
}
