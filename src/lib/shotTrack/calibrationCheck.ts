import { arrowFeet } from "../laneGeometry";
import { PIN_POSITIONS } from "../pinGeometry";
import { apply, downAt } from "./homography";
import { parabolaPeak, sample } from "./image";
import { BALL_DIAMETER_IN, expectedRadiusPx, imageToLane } from "./laneModel";
import type { GrayFrame, Mat3 } from "./types";

/**
 * The pins and arrows test of a calibration (plan 6.5, R8). Things whose lane
 * position is known are found in the picture and compared, in boards, with
 * where the mapping puts them. The pins test the far end, where pixels are
 * scarcest; the arrows the near end.
 */

export interface LandmarkError {
  name: string;
  /** Found minus expected, boards (lane u, so the sign is not handed). */
  error: number;
}

export interface CalibrationReport {
  pins: LandmarkError[];
  arrows: LandmarkError[];
  /** Largest absolute pin error, boards, or null when no pin was found. */
  pinError: number | null;
  arrowError: number | null;
  /** True when either disagrees by more than a board (R8). */
  warn: boolean;
}

/**
 * The outer pins (7 and 10) and the head pin, each found as the brightest
 * column across a row a little above its base, where a pin is a white upright
 * on the dark pit. The row's column maps back to the lane at the pin's own
 * distance. `f` must be a frame before the ball reaches the pins.
 */
export function checkPins(f: GrayFrame, H: Mat3): LandmarkError[] {
  const out: LandmarkError[] = [];
  for (const n of [7, 10, 1] as const) {
    const pin = PIN_POSITIONS[n];
    const base = apply(H, { x: pin.board, y: pin.feet });
    const down = downAt(H, base);
    const across = { x: -down.y, y: down.x };
    const rBall = expectedRadiusPx(H, pin.board, pin.feet);
    const pinH = (15 / BALL_DIAMETER_IN) * 2 * rBall;
    const boardPx = rBall / 4;
    const half = Math.max(3, 3 * boardPx);
    const offs: number[] = [];
    const vals: number[] = [];
    for (let o = -half; o <= half + 1e-9; o += 0.5) {
      let s = 0;
      // Three rows up the pin's body, from a third to two thirds of its height.
      for (const up of [0.35, 0.5, 0.65]) s += sample(f, base.x + o * across.x - up * pinH * down.x, base.y + o * across.y - up * pinH * down.y);
      offs.push(o);
      vals.push(s / 3);
    }
    if (vals.some((v) => !Number.isFinite(v))) continue;
    let bi = 1;
    for (let i = 1; i < vals.length - 1; i++) if (vals[i] > vals[bi]) bi = i;
    if (bi === 0 || bi === vals.length - 1) continue;
    const lowest = Math.min(...vals);
    if (vals[bi] - lowest < 25) continue;
    // The pin is the bright run around the peak at half height; its middle is
    // the pin's axis (a flat-lit pin has no single brightest column).
    const half2 = (vals[bi] + lowest) / 2;
    let l = bi;
    while (l > 0 && vals[l - 1] >= half2) l--;
    let r = bi;
    while (r < vals.length - 1 && vals[r + 1] >= half2) r++;
    if (l === 0 || r === vals.length - 1) continue;
    const cross = (i: number, j: number) => offs[i] + ((half2 - vals[i]) / (vals[j] - vals[i])) * (offs[j] - offs[i]);
    const o = (cross(l - 1, l) + cross(r + 1, r)) / 2;
    const lane = imageToLane(H, { x: base.x + o * across.x, y: base.y + o * across.y });
    out.push({ name: `pin ${n}`, error: lane.u - pin.board });
  }
  return out;
}

/**
 * The arrows on boards 5 to 35, each found as the darkest stripe across a few
 * boards either side, in a band of the lane just behind its tip.
 */
export function checkArrows(f: GrayFrame, H: Mat3): LandmarkError[] {
  const out: LandmarkError[] = [];
  for (let b = 5; b <= 35; b += 5) {
    const tip = arrowFeet(b);
    const us: number[] = [];
    const vals: number[] = [];
    for (let u = b - 2.5; u <= b + 2.5 + 1e-9; u += 0.1) {
      let s = 0;
      let n = 0;
      for (let v = tip - 0.6; v <= tip - 0.1 + 1e-9; v += 0.1) {
        const q = apply(H, { x: u, y: v });
        const g = sample(f, q.x, q.y);
        if (Number.isFinite(g)) {
          s += g;
          n++;
        }
      }
      us.push(u);
      vals.push(n ? s / n : NaN);
    }
    if (vals.some((v) => !Number.isFinite(v))) continue;
    let bi = 1;
    for (let i = 1; i < vals.length - 1; i++) if (vals[i] < vals[bi]) bi = i;
    if (bi <= 1 || bi >= vals.length - 2) continue;
    const sorted = [...vals].sort((x, y) => x - y);
    const typical = sorted[sorted.length >> 1];
    if (typical - vals[bi] < 6) continue;
    const u = us[bi] + parabolaPeak(-vals[bi - 1], -vals[bi], -vals[bi + 1]) * 0.1;
    out.push({ name: `arrow ${b}`, error: u - b });
  }
  return out;
}

export function calibrationReport(pinFrame: GrayFrame | null, pinH: Mat3 | null, arrowFrame: GrayFrame | null, arrowH: Mat3 | null): CalibrationReport {
  const pins = pinFrame && pinH ? checkPins(pinFrame, pinH) : [];
  const arrows = arrowFrame && arrowH ? checkArrows(arrowFrame, arrowH) : [];
  const worst = (e: LandmarkError[]) => (e.length ? Math.max(...e.map((x) => Math.abs(x.error))) : null);
  const pinError = worst(pins);
  const arrowError = worst(arrows);
  return { pins, arrows, pinError, arrowError, warn: (pinError ?? 0) > 1 || (arrowError ?? 0) > 1 };
}
