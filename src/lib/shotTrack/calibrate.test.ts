import { describe, expect, it } from "vitest";
import { apply } from "./homography";
import { fitCalibration, markResiduals, namedLine, namedPoint, type CalMark } from "./calibrate";
import { behindCamera, laneHomography } from "./synthetic";
import { laneU } from "./laneModel";

const cam = behindCamera({ width: 1080, height: 806, side: 1.5, fill: 0.12 });
const H = laneHomography(cam);
const at = (u: number, v: number, dx = 0, dy = 0) => {
  const p = apply(H, { x: u, y: v });
  return { x: p.x + dx, y: p.y + dy };
};
const right = (b: number) => laneU(b, "right");

function lane(markNoise = 0): CalMark[] {
  const j = (k: number) => markNoise * Math.sin(k * 2.7);
  const marks: CalMark[] = [];
  [5, 10, 15, 20, 25, 30, 35].forEach((b, k) => {
    const p = namedPoint(`arrow ${b}`, right)!;
    marks.push({ kind: "point", label: `arrow ${b}`, ...p, at: at(p.u, p.v, j(k), j(k + 9)) });
  });
  for (const n of [1, 7, 10]) {
    const p = namedPoint(`pin ${n}`, right)!;
    marks.push({ kind: "point", label: `pin ${n}`, ...p, at: at(p.u, p.v, j(n + 3), j(n + 5)) });
  }
  const foul = namedLine("foul")!;
  marks.push({ kind: "line", label: "foul", ...foul, at: [at(-4, 0), at(10, 0), at(30, 0)] });
  const left = namedLine("left")!;
  marks.push({ kind: "line", label: "left", ...left, at: [at(0.5, 2), at(0.5, 20)] });
  return marks;
}

describe("calibration from the lane's markings", () => {
  it("names the lane's marks", () => {
    expect(namedPoint("arrow 15", right)).toEqual({ u: 25, v: 14 + 2 / 3 });
    expect(namedPoint("arrow 3", right)).toBeNull();
    expect(namedPoint("pin 11", right)).toBeNull();
    expect(namedPoint("dot 3", right)).toBeNull();
    expect(namedPoint("pin 1", right)!.u).toBe(20);
    expect(namedLine("right")).toEqual({ axis: "u", value: 39.5 });
    expect(namedLine("pinrow")).toEqual({ axis: "v", value: 62.6 });
    expect(namedLine("deck")!.value).toBeCloseTo(62.85, 2);
    expect(namedLine("gutter")).toBeNull();
  });

  it("recovers the mapping from arrows, pins, the foul line and one edge, with no other edge", () => {
    const fit = fitCalibration(lane());
    expect(fit.redundancy).toBeGreaterThan(10);
    expect(fit.worstBoards).toBeLessThan(1e-3);
    for (const [u, v] of [[0.5, 0], [39.5, 0], [39.5, 60], [20, 30]]) {
      const p = apply(fit.H, { x: u, y: v });
      const q = apply(H, { x: u, y: v });
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.01);
    }
  });

  it("stays within a tenth of a board with half a pixel of marking error", () => {
    const fit = fitCalibration(lane(0.5));
    expect(fit.worstBoards).toBeLessThan(0.3);
    const p = apply(fit.H, { x: 39.5, y: 1 });
    const q = apply(H, { x: 39.5, y: 1 });
    expect(Math.abs(p.x - q.x)).toBeLessThan(1);
  });

  it("shows a misplaced mark in its residual", () => {
    const marks = lane();
    const bad = marks[2] as Extract<CalMark, { kind: "point" }>;
    bad.at = { x: bad.at.x + 15, y: bad.at.y };
    const fit = fitCalibration(marks);
    const worst = fit.residuals.reduce((a, b) => (Math.abs(b.boards ?? 0) > Math.abs(a.boards ?? 0) ? b : a));
    expect(worst.label).toBe("arrow 15");
    expect(fit.worstBoards).toBeGreaterThan(1);
  });

  it("reports line residuals in feet along the lane and boards across", () => {
    const res = markResiduals(H, lane());
    const foul = res.filter((r) => r.label === "foul");
    expect(foul).toHaveLength(3);
    expect(foul[0].boards).toBeNull();
    expect(Math.abs(foul[0].feet!)).toBeLessThan(1e-6);
    const left = res.find((r) => r.label === "left")!;
    expect(left.feet).toBeNull();
  });

  it("refuses marks that cannot fix the mapping", () => {
    expect(() => fitCalibration(lane().slice(0, 3))).toThrow(/needs 8/);
    const same: CalMark[] = Array.from({ length: 5 }, (_, k) => ({ kind: "point", label: `p${k}`, u: 20, v: 15, at: at(20, 15) }));
    expect(() => fitCalibration(same)).toThrow(/do not fix/);
  });

  it("is exact with exactly four lines (no redundancy)", () => {
    const four: CalMark[] = [
      { kind: "line", label: "left", axis: "u", value: 0.5, at: [at(0.5, 0), at(0.5, 60)] },
      { kind: "line", label: "right", axis: "u", value: 39.5, at: [at(39.5, 0), at(39.5, 60)] },
      { kind: "line", label: "foul", axis: "v", value: 0, at: [at(0.5, 0), at(39.5, 0)] },
      { kind: "line", label: "pinrow", axis: "v", value: 62.6, at: [at(0.5, 62.6), at(39.5, 62.6)] }
    ];
    const fit = fitCalibration(four);
    expect(fit.redundancy).toBe(0);
    const p = apply(fit.H, { x: 20, y: 30 });
    const q = apply(H, { x: 20, y: 30 });
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.01);
  });
});
