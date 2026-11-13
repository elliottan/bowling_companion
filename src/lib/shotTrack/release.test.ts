import { describe, expect, it } from "vitest";
import { makeFrame } from "./image";
import { overFoulLine } from "./release";
import type { GrayFrame, Mat3 } from "./types";

// A lane seen square on: x = 100 + 10 u, y = 400 - 5 v (the foul line is row 400).
const H: Mat3 = [10, 0, 100, 0, -5, 400, 0, 0, 1];
const R = 8;

/** A dark ball on a light lane, with a light "hand" over its top. */
function frameWith(cx: number, bottom: number): GrayFrame {
  const f = makeFrame(400, 480, 0, 200);
  const cy = bottom - R;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R) f.data[y * f.width + x] = y < cy - 0.5 * R ? 180 : 30;
    }
  }
  return f;
}

function follow(path: (k: number) => { cx: number; bottom: number }) {
  const frames = Array.from({ length: 11 }, (_, k) => frameWith(path(k).cx, path(k).bottom));
  const last = path(10);
  return overFoulLine((i) => frames[i] ?? null, () => H, 10, { cx: last.cx, cy: last.bottom - R, r: R });
}

describe("the ball over the foul line", () => {
  it("reads the first frame the ball sits on the line: where it comes lowest, not where it leaves the line's row", () => {
    // Lowest at frame 4, 6 px below the line's row; its bottom leaves the row at frame 6.5 on its way out.
    const r = follow((k) => ({ cx: 300 - 5 * k, bottom: Math.round(406 - 0.8 * (k - 4) ** 2) }));
    expect(r).not.toBeNull();
    expect(r!.reached).toBe(true);
    expect(Math.abs(r!.at - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.u - 18)).toBeLessThan(0.6);
  });

  it("reads where the ball comes lowest when it never reaches the line", () => {
    // Lowest at frame 5, still 5 px short of the line, then rising again further back.
    const r = follow((k) => ({ cx: 300 - 5 * k, bottom: Math.round(395 - (k - 5) ** 2) }));
    expect(r).not.toBeNull();
    expect(r!.reached).toBe(false);
    expect(Math.abs(r!.at - 5)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.u - 17.5)).toBeLessThan(0.6);
  });

  it("gives up when the ball cannot be followed", () => {
    const blank = makeFrame(400, 480, 0, 200);
    const first = frameWith(250, 390);
    const r = overFoulLine((i) => (i === 10 ? first : blank), () => H, 10, { cx: 250, cy: 382, r: R });
    expect(r).toBeNull();
  });
});
