import { join } from "node:path";
import { fitCalibration, type CalMark } from "../../src/lib/shotTrack/calibrate";
import { apply, invert } from "../../src/lib/shotTrack/homography";
import { register } from "../../src/lib/shotTrack/registration";
import type { Mat3 } from "../../src/lib/shotTrack/types";
import { loadClip, type Clip } from "./clip";
import { readCalibration, toCalMarks, type CalibrationFile } from "./overlay";

/**
 * The hand-verified calibration of a clip as the answer key: the lane mapping
 * on its calibration frame, fitted from `calibrations/<clip>.json` (marks made
 * on other frames carried by registration, as `look.ts --cal` does).
 */
export interface Truth {
  name: string;
  cal: CalibrationFile;
  clip: Clip;
  clipPath: string;
  /** Lane (u, v) to picture on `cal.frame`. */
  H: Mat3;
}

const here = new URL(".", import.meta.url).pathname;

export function loadTruth(name: string, clip?: Clip): Truth {
  const cal = readCalibration(join(here, "calibrations", `${name}.json`));
  const clipPath = join(here, "fixtures", "clips", cal.clip);
  const c = clip ?? loadClip(clipPath);
  return { name, cal, clip: c, clipPath, H: fitTruth(c, cal) };
}

export function fitTruth(clip: Clip, cal: CalibrationFile): Mat3 {
  const marks = toCalMarks(cal);
  const frames = [cal.frame, ...marks.map((m) => m.frame ?? cal.frame)];
  const lo = Math.min(...frames);
  const hi = Math.max(...frames);
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const geo = lo === hi ? null : register(clip, cal.frame, I, lo, hi, cal.register);
  const S = (f: number) => (geo && f !== cal.frame ? geo[f - lo].S : I);
  const inCal: CalMark[] = marks.map((m) => {
    const back = invert(S(m.frame ?? cal.frame));
    return m.kind === "point" ? { ...m, at: apply(back, m.at) } : { ...m, at: m.at.map((p) => apply(back, p)) };
  });
  return fitCalibration(inCal).H;
}
