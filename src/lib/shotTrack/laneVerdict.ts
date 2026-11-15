/**
 * How far to trust a lane the finder found, as one decision for the screen:
 * "sure" (show the readings) or "check" (show them, and ask the bowler to
 * look at the lane drawn on the picture). The shot tracer's result screen
 * draws the lane either way; this only says whether to point at it.
 *
 * The signals and their limits were read off the six sample clips traced as
 * the app traces them (frames scaled to 962 by 718, 24 given to the finder,
 * found lanes traced; 2026-11-14).
 * Two of them separated the one clip whose lane went wrong (shot-03) from
 * the rest: few found lanes agreeing with the best one, and the
 * tracer's pins check. Edge support and the camera's distance did not
 * separate anything on their own (support 0.37 to 0.72, the camera 19 to 26
 * ft, on good and bad clips alike), so the camera only catches a distance
 * none of the clips came near, and a faint edge counts only together with a
 * far end no pin held.
 */

export interface LaneEvidence {
  /** The finder filled in a hidden line (`LaneFound.guess`). */
  guess?: { foul: string } | null;
  /** Share of steps along each edge that agreed (`LaneFound.support`). */
  support?: { left: number; right: number };
  /** Pins that went into the fit as marks (`LaneFound.pinsUsed`). */
  pinsUsed?: number;
  /** How far behind the foul line the lane puts the camera, feet. */
  camera?: number;
  /** Found lanes the tracer kept, and dropped as disagreeing with the rest (`debug.lanes`). */
  kept?: number;
  dropped?: number;
  /** The tracer's pins check on the lane it traced: the worst pin's error, boards (null: no pin found). */
  pinCheck?: number | null;
}

export type LaneDoubt =
  | "foul-guessed"
  | "lanes-disagree"
  | "pins-off"
  | "camera-unusual"
  | "no-pins"
  | "faint-edge";

export interface LaneVerdict {
  level: "sure" | "check";
  /** Every doubt found, the deciding ones first. */
  reasons: LaneDoubt[];
}

/**
 * Fewer than this share of the found lanes kept says most frames found
 * something else than the best one did: shot-03 as the app reads it kept 1 of
 * 20 (and 4 of 22 read in full-range grey, laydown 7 boards off), the other
 * clips 33% to 93%. At full size the harness kept 7 of 28 on shot-03 and read
 * it right, so the line is close to that clip.
 */
export const KEPT_SHARE = 0.25;
/** Fewer kept than this is too few to agree on anything. */
export const KEPT_AT_LEAST = 3;
/** A pin further off than this, boards, fails the tracer's own check (plan 6.5, R8). */
export const PIN_OFF_BOARDS = 1;
/** Where a camera filming a lane stands, feet behind the foul line: the clips are 19 to 26. */
export const CAMERA_USUAL_FT: [number, number] = [15, 32];
/** An edge followed on fewer than this share of its steps is faint: the clips' weakest is 0.37 (shot-02). */
export const FAINT_EDGE = 0.4;

/**
 * The verdict. A guessed foul line, most found lanes disagreeing, a pin off,
 * or an unusual camera distance each call for a check; of the two soft
 * doubts (no pin held the far end, a faint edge) it takes both. Evidence
 * left out counts as no doubt.
 */
export function laneVerdict(e: LaneEvidence): LaneVerdict {
  const hard: LaneDoubt[] = [];
  const soft: LaneDoubt[] = [];
  if (e.guess) hard.push("foul-guessed");
  if (e.kept !== undefined) {
    const found = e.kept + (e.dropped ?? 0);
    if (e.kept < KEPT_AT_LEAST || e.kept < KEPT_SHARE * found) hard.push("lanes-disagree");
  }
  if (e.pinCheck != null && e.pinCheck > PIN_OFF_BOARDS) hard.push("pins-off");
  if (e.camera !== undefined && (e.camera < CAMERA_USUAL_FT[0] || e.camera > CAMERA_USUAL_FT[1])) hard.push("camera-unusual");
  if (e.pinsUsed === 0) soft.push("no-pins");
  if (e.support && Math.min(e.support.left, e.support.right) < FAINT_EDGE) soft.push("faint-edge");
  const check = hard.length > 0 || soft.length >= 2;
  return { level: check ? "check" : "sure", reasons: [...hard, ...soft] };
}
