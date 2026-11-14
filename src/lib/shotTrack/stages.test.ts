import { describe, expect, it } from "vitest";
import { associate, polyfit } from "./associate";
import { laneRoi, medianBackground, steady } from "./background";
import { closeGaps, findCandidates, refineCircle } from "./ballDetect";
import { calibrationReport, checkArrows, checkPins } from "./calibrationCheck";
import { fitLine, robustLine, snapEdge } from "./edgeSnap";
import { apply, intersect, multiply, segmentLine } from "./homography";
import { makeFrame, warp } from "./image";
import { BALL_RADIUS_FT, BOARD_FT, CONTACT_IN, expectedRadiusPx, laneToWorld } from "./laneModel";
import { boardAtPins, fitMotion, fitPath, localU, metrics, nelderMead, pathU, pinContactFeet, timeAtFeet, withoutIslands } from "./pathFit";
import { globalShift, register } from "./registration";
import { project, timeAt, truthAt } from "./synthetic";
import { standardShot, syntheticSource } from "./syntheticSource";
import type { GrayFrame, Mat3 } from "./types";

describe("edgeSnap", () => {
  it("finds a sub-pixel edge with 40% of the line covered", () => {
    // A slanted step at x = 40.3 + 0.1 y, lane (bright) to the right.
    const f = makeFrame(100, 120);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 100; x++) {
        const edge = 40.3 + 0.1 * y;
        f.data[y * 100 + x] = 60 + 120 * Math.min(1, Math.max(0, x - edge + 0.5));
        if (y < 48 && x > 30 && x < 60) f.data[y * 100 + x] = 20 + ((x * 7 + y * 3) % 30);
      }
    }
    const r = snapEdge(f, { a: { x: 41, y: 2 }, b: { x: 52, y: 118 } }, { band: 6, interior: { x: 90, y: 60 }, sign: "rising" });
    expect(r.ok).toBe(true);
    for (const y of [60, 100]) expect(intersect(r.line, [0, 1, -y])!.x).toBeCloseTo(40.3 + 0.1 * y, 1);
    const flat = snapEdge(makeFrame(50, 50, 0, 90), { a: { x: 10, y: 5 }, b: { x: 12, y: 45 } });
    expect(flat.ok).toBe(false);
    const falling = snapEdge(f, { a: { x: 41, y: 60 }, b: { x: 52, y: 118 } }, { band: 6, interior: { x: 0, y: 60 }, sign: "falling" });
    expect(falling.ok).toBe(true);
  });

  // A bright lane whose edge is a faint, thin dark line (3 px), then a pale
  // strip, then a much stronger dark groove: the shape of a lane beside a
  // gutter. Columns left to right: 150 | groove 60 (20..29) | strip 195 (30..36)
  // | line 150 (37..39) | lane 200 (40..). The lane is to the right (or to the
  // left when `flip`), so the groove's flank at 29.5 is far the strongest, the
  // line's flank at 39.5 is the lane's own edge and the line's middle is 38.
  const grooveFrame = (flip = false) => {
    const f = makeFrame(100, 60);
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 100; x++) {
        let v = 150;
        if (x >= 20 && x <= 29) v = 60;
        else if (x >= 30 && x <= 36) v = 195;
        else if (x >= 37 && x <= 39) v = 150;
        else if (x >= 40) v = 200;
        f.data[y * 100 + (flip ? 99 - x : x)] = v;
      }
    }
    return f;
  };
  const edgeAt = (r: ReturnType<typeof snapEdge>, y = 30) => intersect(r.line, [0, 1, -y])!.x;
  const rough = { a: { x: 40, y: 5 }, b: { x: 40, y: 55 } };

  it("takes the strongest edge by default, the first one from the lane side with pick first", () => {
    const base = { band: 12, interior: { x: 90, y: 30 }, sign: "rising" as const };
    const strongest = snapEdge(grooveFrame(), rough, base);
    expect(strongest.ok).toBe(true);
    expect(edgeAt(strongest)).toBeCloseTo(29.5, 0);
    expect(snapEdge(grooveFrame(), rough, { ...base, pick: "strongest" }).inliers.length).toBe(strongest.inliers.length);
    const first = snapEdge(grooveFrame(), rough, { ...base, pick: "first", firstShare: 0.1, firstMin: 5 });
    expect(first.ok).toBe(true);
    expect(Math.abs(edgeAt(first) - 39.5)).toBeLessThan(0.6);
    expect(first.rms).toBeLessThan(0.2);
  });

  it("holds to the strongest edge when the first one is under the share or the minimum gradient", () => {
    const base = { band: 12, interior: { x: 90, y: 30 }, sign: "rising" as const, pick: "first" as const };
    // The faint line's flank is about a fifth of the groove's: a 0.9 share rejects it...
    expect(edgeAt(snapEdge(grooveFrame(), rough, { ...base, firstShare: 0.9 }))).toBeCloseTo(29.5, 0);
    // ...and so does a minimum above its gradient (the default share is 0.4).
    expect(edgeAt(snapEdge(grooveFrame(), rough, { ...base, firstShare: 0.01, firstMin: 100 }))).toBeCloseTo(29.5, 0);
    expect(edgeAt(snapEdge(grooveFrame(), rough, base))).toBeCloseTo(29.5, 0);
  });

  it("works the same with the lane to the left, and reports no edge on a flat picture with pick first", () => {
    const r = snapEdge(grooveFrame(true), { a: { x: 59, y: 5 }, b: { x: 59, y: 55 } }, { band: 12, interior: { x: 10, y: 30 }, sign: "rising", pick: "first", firstShare: 0.1, firstMin: 5 });
    expect(r.ok).toBe(true);
    expect(Math.abs(edgeAt(r) - 59.5)).toBeLessThan(0.6);
    const flat = snapEdge(makeFrame(60, 60, 0, 90), { a: { x: 30, y: 5 }, b: { x: 30, y: 55 } }, { interior: { x: 50, y: 30 }, sign: "rising", pick: "first" });
    expect(flat.ok).toBe(false);
  });

  it("steps out to the middle of the dark line with toLine", () => {
    const base = { band: 12, interior: { x: 90, y: 30 }, sign: "rising" as const, pick: "first" as const, firstShare: 0.1, firstMin: 5 };
    const flank = edgeAt(snapEdge(grooveFrame(), rough, base));
    const mid = snapEdge(grooveFrame(), rough, { ...base, toLine: 4 });
    expect(mid.ok).toBe(true);
    expect(edgeAt(mid)).toBeLessThan(flank - 0.8);
    expect(Math.abs(edgeAt(mid) - 38)).toBeLessThan(0.8);
    // Too short a reach to find where the gradient turns back: the flank stays.
    expect(edgeAt(snapEdge(grooveFrame(), rough, { ...base, toLine: 0.5 }))).toBeCloseTo(flank, 5);
  });

  it("fits robust lines", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 2 * i + 1 }));
    pts.push({ x: 5, y: 80 }, { x: 9, y: -40 });
    const r = robustLine(pts, 0.5)!;
    expect(r.inliers.length).toBe(30);
    expect(robustLine([{ x: 1, y: 1 }], 1)).toBeNull();
    const l = fitLine([{ x: 0, y: 3 }, { x: 10, y: 3 }]);
    expect(Math.abs(l[1])).toBeCloseTo(1);
  });
});

describe("registration", () => {
  it("measures a shift of the picture", () => {
    const spec = standardShot({ width: 180, height: 320 });
    const a = syntheticSource(spec).frame(3);
    const M: Mat3 = [1, 0, -3.4, 0, 1, 2.2, 0, 0, 1];
    const b = warp(a, M, 0, 0, a.width, a.height);
    const fill: GrayFrame = { ...b, data: b.data.map((v) => (Number.isFinite(v) ? v : 128)) };
    const s = globalShift(a, fill);
    expect(s.x).toBeCloseTo(3.4, 0);
    expect(s.y).toBeCloseTo(-2.2, 0);
  });

  // Plan 7.3: the far corners within 0.3 pixel, with the body in the picture.
  it("carries the far corners through drift and jitter", () => {
    const spec = standardShot({ width: 240, height: 427, duration: 1.2, fill: 0.3, body: true });
    const src = syntheticSource(spec);
    const last = src.count - 1;
    const geo = register(src, last, truthAt(spec, last).H, 0, last);
    for (const i of [0, 10, 25]) {
      expect(geo[i].ok).toBe(true);
      const t = truthMarks(spec, i);
      const truth = intersect(segmentLine(t.left), segmentLine(t.deck))!;
      const got = apply(geo[i].H, { x: 0.5, y: 62.849 });
      expect(Math.hypot(got.x - truth.x, got.y - truth.y)).toBeLessThan(0.3);
    }
  }, 30000);
});

function truthMarks(spec: ReturnType<typeof standardShot>, i: number) {
  const H = truthAt(spec, i).H;
  const at = (u: number, v: number) => apply(H, { x: u, y: v });
  return {
    left: { a: at(0.5, 0), b: at(0.5, 62.849) },
    right: { a: at(39.5, 0), b: at(39.5, 62.849) },
    foul: { a: at(0.5, 0), b: at(39.5, 0) },
    deck: { a: at(0.5, 62.849), b: at(39.5, 62.849) }
  };
}

describe("ballDetect", () => {
  const spec = { ...standardShot({ width: 240, height: 427, fill: 0.3, body: true, fps: 15 }), jitter: 0, drift: undefined };
  const src = syntheticSource(spec);
  const H = truthAt(spec, 0).H;
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const roi = laneRoi(H, 240, 427);
  const bg = medianBackground(Array.from({ length: src.count }, (_, i) => steady(src.frame(i), I, roi)));

  it("finds the ball, and not the body or the ball on the next lane", () => {
    const i = Math.round(timeAt(spec, 25) * spec.fps);
    const f = src.frame(i);
    const c = findCandidates(steady(f, I, roi), bg, roi, I, H, i);
    const truth = truthAt(spec, i).ball!;
    expect(c.length).toBe(1);
    expect(Math.abs(c[0].u - truth.u)).toBeLessThan(1);
    expect(Math.abs(c[0].v - truth.v)).toBeLessThan(1.5);
  });

  it("joins a ball's highlight to its lower half when its top is lost against the pit", () => {
    // A flat empty lane; the ball changes it only in a small highlight at its
    // top and in its lower half, with a band of no change between them.
    const at = apply(H, { x: 20, y: 30 });
    const r = Math.round(expectedRadiusPx(H, 20, 30));
    expect(r).toBeGreaterThanOrEqual(5);
    const cx = Math.round(at.x) - roi.x0;
    const cy = Math.round(at.y) - r - roi.y0;
    const flat = makeFrame(roi.width, roi.height, 0, 120);
    const draw = (highlight: boolean) => {
      const f = makeFrame(roi.width, roi.height, 0, 120);
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r) continue;
          const low = y >= 1;
          const top = highlight && y <= -r + 2 && Math.abs(x) <= 2;
          if (low || top) f.data[(cy + y) * roi.width + cx + x] = top ? 220 : 30;
        }
      }
      return f;
    };
    const whole = findCandidates(draw(true), flat, roi, I, H, 0);
    expect(whole.length).toBe(1);
    expect(whole[0].box.y1 - whole[0].box.y0).toBeGreaterThanOrEqual(2 * r - 2);
    expect(Math.abs(whole[0].y - (cy + roi.y0))).toBeLessThan(1.5);
    // Without the highlight the lower half alone is not the shape of a ball.
    expect(findCandidates(draw(false), flat, roi, I, H, 0).length).toBe(0);
  });

  it("closes gaps in the change up to twice the radius wide, and no wider", () => {
    const w = 20;
    const h = 9;
    const mask = new Uint8Array(w * h);
    const set = (x0: number, x1: number) => {
      for (let y = 2; y <= 6; y++) for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
    };
    set(1, 3);
    set(7, 9); // a 3 pixel gap from the first strip
    set(16, 18); // a 6 pixel gap from the second
    const closed = closeGaps(mask, w, h, 2);
    expect(closed[4 * w + 5]).toBe(1);
    expect(closed[4 * w + 12]).toBe(0);
    // Nothing grows: what was clear outside the strips stays clear.
    expect(closed[0]).toBe(0);
    expect(closed[4 * w + 19]).toBe(0);
    expect(closed[4 * w + 8]).toBe(1);
  });

  it("finds a ball whose change the gaps between the pins cut into strips", () => {
    const at = apply(H, { x: 20, y: 30 });
    const r = Math.round(expectedRadiusPx(H, 20, 30));
    const cx = Math.round(at.x) - roi.x0;
    const cy = Math.round(at.y) - r - roi.y0;
    const flat = makeFrame(roi.width, roi.height, 0, 120);
    const f = makeFrame(roi.width, roi.height, 0, 120);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        // Every fourth and fifth column shows no change, top to bottom.
        if (x * x + y * y <= r * r && (x + 100) % 5 < 3) f.data[(cy + y) * roi.width + cx + x] = 30;
      }
    }
    const c = findCandidates(f, flat, roi, I, H, 0);
    expect(c.length).toBe(1);
    expect(Math.abs(c[0].x - (cx + roi.x0))).toBeLessThan(1.5);
  });

  it("fits the circle's centre within 0.3 pixel", () => {
    const i = Math.round(timeAt(spec, 30) * spec.fps);
    const truth = truthAt(spec, i);
    const w = laneToWorld(truth.ball!.u, truth.ball!.v);
    const c = project(truth.camera, [w.x, w.y, BALL_RADIUS_FT])!;
    const fit = refineCircle(src.frame(i), H, { x: c.x + 1.5, y: c.y - 1 }, 0.98 * truth.camera.focal * BALL_RADIUS_FT / Math.hypot(w.x - truth.camera.x, w.y - truth.camera.y, BALL_RADIUS_FT - truth.camera.z))!;
    expect(Math.hypot(fit.cx - c.x, fit.cy - c.y)).toBeLessThan(0.3);
    expect(fit.weight).toBeGreaterThan(0.5);
    expect(refineCircle(makeFrame(60, 60, 0, 100), H, { x: 30, y: 30 }, 8)).toBeNull();
  });

  it("checks the calibration against the pins and the arrows", () => {
    const clear = { ...spec, body: undefined };
    const f = syntheticSource(clear).frame(0);
    const pins = checkPins(f, H);
    const arrows = checkArrows(f, H);
    expect(pins.length).toBe(3);
    expect(arrows.length).toBeGreaterThan(4);
    for (const e of [...pins, ...arrows]) expect(Math.abs(e.error)).toBeLessThan(0.35);
    // A mapping two boards off is caught.
    const off = multiply(H, [1, 0, 2, 0, 1, 0, 0, 0, 1]);
    const report = calibrationReport(f, off, f, off);
    expect(report.warn).toBe(true);
    expect(calibrationReport(null, null, null, null).pinError).toBeNull();
  });
});

describe("associate", () => {
  it("keeps the one ball and drops the rest", () => {
    const cands = [];
    for (let i = 0; i < 60; i++) {
      const t = i / 30;
      cands.push({ frame: i, t, v: 2 + 24 * t, u: 25 + 0.1 * (2 + 24 * t) });
      if (i % 3 === 0) cands.push({ frame: i, t, v: 40 - 5 * t, u: 5 });
      if (i % 4 === 0) cands.push({ frame: i, t, v: 10 + 24 * t, u: 34 });
    }
    const got = associate(cands);
    expect(got.length).toBe(60);
    expect(got.every((c) => c.u > 24)).toBe(true);
    expect(polyfit([0, 1, 2], [1, 3, 7], 2)[2]).toBeCloseTo(1);
  });
});

describe("pathFit", () => {
  const shape = { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 };
  const pts = Array.from({ length: 80 }, (_, i) => {
    const v = 1 + i * 0.73;
    return { v, u: pathU({ kind: "hook", ...shape }, v) + 0.05 * Math.sin(i * 1.3), w: 1, sv: 0.1 };
  });

  it("recovers a hook and reads its metrics in handed boards", () => {
    const fit = fitPath(pts);
    expect(fit.path.kind).toBe("hook");
    expect(fit.rms).toBeLessThan(0.1);
    const m = metrics({
      path: fit.path, hand: "right", seen: pts.map((p) => p.v), touchdown: 1,
      motion: { v0: -10, w: 25, d: -1 }, tFirst: 0.5, tLast: 2.8, speedMeasured: true, anchoredSpeed: 23.6
    });
    // The laydown is the board over the foul line; the touchdown is where the ball lands.
    expect(m.laydown.state).toBe("measured");
    expect(m.laydown.value!).toBeCloseTo(40 - pathU(fit.path, 0), 5);
    expect(m.touchdown.value!).toBeCloseTo(40 - pathU(fit.path, 1), 5);
    expect(m.touchdownFeet.value).toBe(1);
    expect(m.arrows.state).toBe("measured");
    expect(m.arrows.value!).toBeCloseTo(40 - pathU(fit.path, 15), 5);
    expect(m.breakpoint.state).toBe("measured");
    expect(m.pins.state).toBe("measured");
    expect(m.launchAngle.state).toBe("measured");
    expect(m.speed.state).toBe("measured");
    // The two readings must agree within 1.5 mph to count as measured.
    const off = metrics({
      path: fit.path, hand: "right", seen: pts.map((p) => p.v), touchdown: 1,
      motion: { v0: -10, w: 25, d: -1 }, tFirst: 0.5, tLast: 2.8, speedMeasured: true, anchoredSpeed: 30
    });
    expect(off.speed.state).toBe("estimated");
    expect(off.speed.value!).toBeCloseTo(23.35 * (3600 / 5280), 1);
    expect(pinContactFeet(fit.path)).toBeGreaterThan(59);
  });

  it("reads the laydown and the arrows off the sightings around them", () => {
    // Curved from the foul line, then a hard turn: one bend cannot follow both.
    const u = (v: number) => 22 + 0.3 * v - 0.004 * v * v - (v > 44 ? 0.04 * (v - 44) ** 2 : 0);
    const curved = Array.from({ length: 110 }, (_, i) => ({ v: 1 + i * 0.5, u: u(1 + i * 0.5) + 0.05 * Math.sin(i * 1.7), w: 1, sv: 0.1 }));
    const fit = fitPath(curved);
    const input = {
      path: fit.path, hand: "right" as const, seen: curved.map((p) => p.v), touchdown: 1,
      motion: { v0: -10, w: 25, d: -1 }, tFirst: 0.5, tLast: 2.8, speedMeasured: true
    };
    const m = metrics({ ...input, points: curved });
    expect(Math.abs(m.laydown.value! - (40 - u(0)))).toBeLessThan(0.15);
    expect(Math.abs(m.arrows.value! - (40 - u(15)))).toBeLessThan(0.15);
    // Without the sightings, the whole path's board is what there is.
    expect(metrics(input).laydown.value!).toBeCloseTo(40 - pathU(fit.path, 0), 5);
    // Too few sightings, or too short a stretch, give no local reading.
    expect(localU(curved.slice(0, 5), 0, 10, 0)).toBeNull();
    expect(localU(curved, 1, 4, 0)).toBeNull();
    // One wild sighting does not move the line.
    const wild = curved.map((p, i) => (i === 6 ? { ...p, u: p.u + 6 } : p));
    expect(Math.abs(localU(wild, 1, 11, 0)! - u(0))).toBeLessThan(0.2);
  });

  it("reads the board at the pins off the last sightings, by when they were seen", () => {
    // A ball that turns a board a foot from 54 ft on, at 22 ft a second.
    const u = (v: number) => 30 - (v > 54 ? 1.0 * (v - 54) : 0);
    const motion = { v0: 0, w: 22, d: 0 };
    const late = Array.from({ length: 59 }, (_, i) => {
      const v = 1 + i;
      // Next to the rack a sighting's own distance jumps about; its time does not.
      return { v: v > 54 ? v + (i % 2 ? 1.2 : -1.2) : v, u: u(v), w: 1, sv: 0.1, t: v / 22 };
    });
    const fit = fitPath(late);
    const m = metrics({
      path: fit.path, hand: "right", seen: late.map((p) => p.v), points: late, touchdown: 1,
      motion, tFirst: late[0].t, tLast: late[late.length - 1].t, speedMeasured: true
    });
    expect(m.pins.state).toBe("measured");
    // Read where the ball first meets the head pin, a little short of its spot at 60 ft.
    const meet = 60 - Math.sqrt((CONTACT_IN / 12) ** 2 - ((40 - u(59.4) - 20) * BOARD_FT) ** 2);
    expect(Math.abs(m.pins.value! - (40 - u(meet)))).toBeLessThan(0.25);
  });

  it("reads the board at the pins only from sightings before the ball meets them", () => {
    // Straight at board 18 to the pins, then deflected two boards a foot among them.
    const pts = Array.from({ length: 30 }, (_, i) => {
      const t = 2.4 + i / 30;
      const v = 22 * t;
      return { v, u: v < 59.4 ? 22 : 22 + 2 * (v - 59.4), w: 1, sv: 0.1, t };
    }).filter((p) => p.v >= 53);
    expect(boardAtPins(pts, 59.4)! - 22).toBeCloseTo(0, 1);
    // Told when the rack first moved, a ball seen past contact is still read before it.
    expect(boardAtPins(pts, 70, 59.4 / 22)! - 22).toBeCloseTo(0, 1);
    // Too few sightings give no reading.
    expect(boardAtPins(pts.slice(0, 3), 59.4)).toBeNull();
  });

  it("marks what it could not see as estimated or missing", () => {
    const mid = pts.filter((p) => p.v > 20 && p.v < 50);
    const fit = fitPath(mid);
    const m = metrics({
      path: fit.path, hand: "left", seen: mid.map((p) => p.v), touchdown: null,
      motion: { v0: 0, w: 50, d: 0 }, tFirst: 0, tLast: 1, speedMeasured: false
    });
    expect(m.laydown.state).toBe("estimated");
    expect(m.touchdown.state).toBe("missing");
    expect(m.touchdownFeet.state).toBe("missing");
    expect(m.pins.state).toBe("missing");
    expect(m.speed.state).toBe("missing");
    // First sighting by 30 ft with the skid seen: the arrows are estimated.
    expect(m.arrows.state).toBe("estimated");
  });

  it("finds the breakpoint of a shot that bends from the first feet on", () => {
    // shot-05 as the tracer saw it, in handed boards every 4 ft: the slope
    // across falls steadily from the laydown, the ball turns near 44 ft, and
    // the far sightings are few and uncertain.
    const seen05 = [17.9, 16.4, 15.2, 14.0, 12.9, 11.9, 11.1, 10.4, 10.1, 9.8, 8.8, 8.9, 10.1, 11.0];
    const at = (v: number) => {
      const x = Math.min(seen05.length - 1.001, Math.max(0, (v - 2) / 4));
      const i = Math.floor(x);
      return 40 - (seen05[i] + (seen05[i + 1] - seen05[i]) * (x - i));
    };
    const bend = Array.from({ length: 100 }, (_, i) => {
      const v = 1.5 + i * 0.52;
      return { v, u: at(v) + 0.05 * Math.sin(i * 1.7), w: v > 46 ? 0.4 : 1, sv: v > 46 ? 1 : 0.1 };
    }).filter((p, i) => p.v < 46 || i % 3 === 0);
    const fit = fitPath(bend);
    const m = metrics({
      path: fit.path, hand: "right", seen: bend.map((p) => p.v), touchdown: 1.5,
      motion: { v0: 0, w: 26, d: 0 }, tFirst: 0, tLast: 2, speedMeasured: false
    });
    expect(m.breakpoint.state).not.toBe("missing");
    expect(m.breakpointFeet.value!).toBeGreaterThan(38);
    expect(m.breakpointFeet.value!).toBeLessThan(50);
    expect(Math.abs(m.breakpoint.value! - 8.8)).toBeLessThan(0.6);
  });

  it("does not fit across a long unseen stretch to a handful of far sightings", () => {
    const near = pts.filter((p) => p.v < 27);
    const far = [55.7, 56, 56.5, 57.3].map((v) => ({ v, u: 41, w: 1, sv: 0.5 }));
    const kept = withoutIslands([...near, ...far]);
    expect(kept).toEqual(near);
    const m = metrics({
      path: fitPath(kept).path, hand: "right", seen: kept.map((p) => p.v), touchdown: 1,
      motion: { v0: 0, w: 20, d: 0 }, tFirst: 0, tLast: 1.3, speedMeasured: false
    });
    expect(m.pins.state).toBe("missing");
    // A far group big enough to stand on its own stays, and so does everything
    // when no group is big.
    const farMany = Array.from({ length: 9 }, (_, i) => ({ v: 50 + i, u: 30, w: 1 }));
    expect(withoutIslands([...near, ...farMany])).toHaveLength(near.length + 9);
    expect(withoutIslands([{ v: 1 }, { v: 2 }, { v: 40 }])).toEqual([{ v: 1 }, { v: 2 }]);
    expect(withoutIslands([])).toEqual([]);
  });

  it("falls back to a smoothing spline when the shape does not fit", () => {
    const zig = pts.map((p, i) => ({ ...p, u: 20 + (i % 20 < 10 ? 3 : -3) }));
    const fit = fitPath(zig);
    expect(fit.path.kind).toBe("spline");
    expect(Number.isFinite(pathU(fit.path, 70))).toBe(true);
    expect(Number.isFinite(pathU(fit.path, -5))).toBe(true);
  });

  it("fits distance against time with the ball only slowing", () => {
    const m = fitMotion(Array.from({ length: 40 }, (_, i) => ({ t: i / 20, v: 2 + 25 * (i / 20) + 0.4 * (i / 20) ** 2, w: 1 })));
    expect(m.d).toBeLessThanOrEqual(0);
    expect(timeAtFeet({ v0: 0, w: 20, d: 0 }, 40)).toBeCloseTo(2);
    expect(timeAtFeet({ v0: 0, w: 0, d: 0 }, 40)).toBeNull();
    expect(timeAtFeet({ v0: 0, w: 10, d: -10 }, 40)).toBeNull();
    expect(nelderMead((x) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2, [0, 0], [1, 1]).x[0]).toBeCloseTo(3, 3);
  });
});
