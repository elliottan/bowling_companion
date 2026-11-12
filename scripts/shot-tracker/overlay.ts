import { readFileSync } from "node:fs";
import { arrowFeet } from "../../src/lib/laneGeometry";
import { PIN_POSITIONS } from "../../src/lib/pinGeometry";
import { apply } from "../../src/lib/shotTrack/homography";
import { DECK_END_FT, LEFT_U, RIGHT_U, handedBoard } from "../../src/lib/shotTrack/laneModel";
import type { LaneMarks, Mat3, Point, Segment } from "../../src/lib/shotTrack/types";
import type { Handedness } from "../../src/types/bowling";
import { CYAN, MAGENTA, RED, cross, dot, line, text, type Canvas, type Color } from "./draw";

/** A hand-made calibration beside the harness (plan 10.3). */
export interface CalibrationFile {
  clip: string;
  frame: number;
  hand: Handedness;
  /**
   * Each line as two points on the calibration frame, or on another frame
   * named third (plan 6.3: a line hidden on the chosen frame is marked where
   * it shows, and carried over by the picture's shift between the frames).
   */
  marks: Record<keyof LaneMarks, [[number, number], [number, number]] | [[number, number], [number, number], number]>;
  /** Distance of the far marked line: 62.6 when it is marked at the bases of the 7 and 10 pins. */
  farFeet?: number;
  /** A point on the lane, for orienting edges snapped on another frame, per frame. */
  interior?: Record<string, [number, number]>;
  /** Registration tuning for this clip (band and slack in pixels). */
  register?: { band?: number; slack?: number };
  /** Not calibrated: why. The harness writes a review page that says so. */
  skip?: string;
  notes?: string;
  /** The owner's own reading of the shot, when they have one. */
  owner?: string;
}

export function readCalibration(path: string): CalibrationFile {
  return JSON.parse(readFileSync(path, "utf8")) as CalibrationFile;
}

export function toMarks(
  c: CalibrationFile,
  carry?: (from: number, to: number) => { x: number; y: number },
  refine?: (frame: number, s: Segment, edge: boolean) => Segment
): LaneMarks {
  const seg = (s: [[number, number], [number, number]] | [[number, number], [number, number], number], key: string) => {
    let g: Segment = { a: { x: s[0][0], y: s[0][1] }, b: { x: s[1][0], y: s[1][1] } };
    if (s.length !== 3 || !carry) return g;
    // Snapped where it shows, then carried by the picture's shift.
    if (refine) g = refine(s[2], g, key === "left" || key === "right");
    const d = carry(s[2], c.frame);
    return { a: { x: g.a.x + d.x, y: g.a.y + d.y }, b: { x: g.b.x + d.x, y: g.b.y + d.y } };
  };
  return { left: seg(c.marks.left, "left"), right: seg(c.marks.right, "right"), foul: seg(c.marks.foul, "foul"), deck: seg(c.marks.deck, "deck") };
}

export function drawSegment(c: Canvas, s: { a: Point; b: Point }, col: Color, k = 1, ox = 0, oy = 0, dash?: number): void {
  line(c, (s.a.x - ox) * k, (s.a.y - oy) * k, (s.b.x - ox) * k, (s.b.y - oy) * k, col, { dash });
}

/**
 * Board lines every `every` boards, numbered in the bowler's handed boards,
 * from `v0` to `v1` feet, on a canvas that is the frame cropped at (ox, oy)
 * and enlarged k times.
 */
export function drawBoards(
  c: Canvas, H: Mat3, hand: Handedness,
  o: { k?: number; ox?: number; oy?: number; v0?: number; v1?: number; every?: number; labelAt?: number; color?: Color } = {}
): void {
  const k = o.k ?? 1;
  const ox = o.ox ?? 0;
  const oy = o.oy ?? 0;
  const v0 = o.v0 ?? 0;
  const v1 = o.v1 ?? DECK_END_FT;
  const every = o.every ?? 5;
  for (let b = 0; b <= 40; b += every) {
    const u = handedBoard(b === 0 ? 0.5 : b === 40 ? 39.5 : b, hand);
    if (u < LEFT_U - 1e-9 || u > RIGHT_U + 1e-9) continue;
    const p = apply(H, { x: u, y: v0 });
    const q = apply(H, { x: u, y: v1 });
    line(c, (p.x - ox) * k, (p.y - oy) * k, (q.x - ox) * k, (q.y - oy) * k, o.color ?? CYAN, { alpha: 0.75 });
    if (o.labelAt !== undefined) {
      const l = apply(H, { x: u, y: o.labelAt });
      const label = b === 0 ? "" : b === 40 ? "" : String(b);
      if (label) text(c, (l.x - ox) * k - 4, (l.y - oy) * k + 4, label, o.color ?? CYAN, 2);
    }
  }
}

/** A cross-lane line at `v` feet. */
export function drawAcross(c: Canvas, H: Mat3, v: number, col: Color, k = 1, ox = 0, oy = 0): void {
  const p = apply(H, { x: LEFT_U, y: v });
  const q = apply(H, { x: RIGHT_U, y: v });
  line(c, (p.x - ox) * k, (p.y - oy) * k, (q.x - ox) * k, (q.y - oy) * k, col, { alpha: 0.8, dash: 4 });
}

export function drawLandmarks(c: Canvas, H: Mat3, k = 1, ox = 0, oy = 0): void {
  for (let b = 5; b <= 35; b += 5) {
    const p = apply(H, { x: b, y: arrowFeet(b) });
    dot(c, (p.x - ox) * k, (p.y - oy) * k, Math.max(1, Math.round(k / 2)), MAGENTA);
  }
  for (const pin of Object.values(PIN_POSITIONS)) {
    const p = apply(H, { x: pin.board, y: pin.feet });
    cross(c, (p.x - ox) * k, (p.y - oy) * k, Math.max(2, k), RED);
  }
}
