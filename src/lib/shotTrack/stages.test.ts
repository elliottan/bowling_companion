import { describe, expect, it } from "vitest";
import { associate, FAR_FT, FAR_SLACK_FT, onePace, polyfit } from "./associate";
import { laneRoi, medianBackground, steady } from "./background";
import { closeGaps, findCandidates, refineCircle, steadiedScale } from "./ballDetect";
import { calibrationReport, checkArrows, checkPins } from "./calibrationCheck";
import { fitLine, robustLine, snapEdge } from "./edgeSnap";
import { apply, intersect, multiply, segmentLine } from "./homography";
import { makeFrame, warp } from "./image";
import { BALL_RADIUS_FT, BOARD_FT, CONTACT_IN, expectedRadiusPx, laneToWorld } from "./laneModel";
import { boardAtPins, BREAKPOINT_FT, breakpointState, fitMotion, fitPath, hookFrom, localU, MAX_HOOK_BOARDS, metrics, nelderMead, pathU, pinContactFeet, pinsPlausible, ROUGH_RMS, timeAtFeet, withoutIslands } from "./pathFit";
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

  it("finds a ball on a frame the camera has zoomed in on since the calibration frame, at its own size there", () => {
    // The frame is the calibration frame seen 1.8 times larger (IMG_2938: the
    // camera zooms in as the ball nears the pins). The steadied picture is in
    // the calibration frame's pixels, where the ball shows at its size there.
    const k = 1.8;
    const S: Mat3 = [k, 0, -150, 0, k, -120, 0, 0, 1];
    const Hf = multiply(S, H);
    const u = 22;
    const v = 50;
    const contact = apply(H, { x: u, y: v });
    const r = expectedRadiusPx(H, u, v);
    expect(expectedRadiusPx(Hf, u, v) / r).toBeCloseTo(k, 1);
    const cx = contact.x - roi.x0;
    const cy = contact.y - r - roi.y0;
    const flat = makeFrame(roi.width, roi.height, 0, 120);
    const f = makeFrame(roi.width, roi.height, 0, 120);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) f.data[y * roi.width + x] = 30;
      }
    }
    const c = findCandidates(f, flat, roi, S, Hf, 0);
    expect(c.length).toBe(1);
    // In the frame's own pixels, at the frame's size, standing where it is.
    expect(c[0].r / r).toBeCloseTo(k, 1);
    expect(Math.abs(c[0].u - u)).toBeLessThan(1);
    expect(Math.abs(c[0].v - v)).toBeLessThan(1.5);
  });

  it("judges a blob at the frame's size until the zoom is more than the width tolerance absorbs", () => {
    expect(steadiedScale(1, 0.35)).toBe(1);
    // Within the tolerance a ball at its true size still passes: the frame's size stands.
    expect(steadiedScale(1.4, 0.35)).toBe(1);
    expect(steadiedScale(0.8, 0.35)).toBe(1);
    // Beyond it none could: the steadied picture's own.
    expect(steadiedScale(1.8, 0.35)).toBe(1.8);
    expect(steadiedScale(0.7, 0.35)).toBe(0.7);
    expect(steadiedScale(NaN, 0.35)).toBe(1);
    expect(steadiedScale(0, 0.35)).toBe(1);
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

  // shot-04 read from just before the foul line: the ball from 0.8 to 9.7 ft
  // at 24 ft/s, then hidden behind the bowler, and something at 12.5 to 16 ft
  // half a second later that hardly moves.
  const ball = Array.from({ length: 23 }, (_, i) => ({ frame: 78 + i, t: 1.3 + i / 60, v: 0.8 + 24 * (i / 60), u: 34 + 0.03 * i }));
  const stray = [
    ...[0, 1, 2].map((k) => ({ frame: 127 + k, t: 2.119 + k / 60, v: 12.9 + 0.2 * k, u: 31 })),
    ...[0, 2, 3, 4, 6].map((k) => ({ frame: 139 + k, t: 2.319 + k / 60, v: 13 - 0.1 * k, u: 31.5 }))
  ];

  it("keeps the ball's pieces at the ball's pace, and nothing it could not have reached", () => {
    expect(onePace([...ball, ...stray])).toEqual(ball);
    // Lost for 0.2 s and seen again where its speed puts it: one ball.
    const on = Array.from({ length: 12 }, (_, i) => ({ frame: 113 + i, t: 1.3 + (35 + i) / 60, v: 0.8 + 24 * ((35 + i) / 60), u: 35 }));
    expect(onePace([...ball, ...on])).toEqual([...ball, ...on]);
    // A piece before the longest is judged the other way: no sighting further on than the ball could have come from.
    const ahead = [0, 1, 2].map((k) => ({ frame: 60 + k, t: 1.0 + k / 60, v: 9 + 0.1 * k, u: 30 }));
    expect(onePace([...ahead, ...ball])).toEqual(ball);
    // A stray at a piece's end does not cost the piece: it is judged by most of its sightings.
    const tail = [...on.slice(0, 8), { ...on[8], v: on[8].v + 6 }];
    expect(onePace([...ball, ...tail])).toEqual([...ball, ...tail]);
  });

  it("leaves a set in one piece, or with no piece seen long enough to time, as it is", () => {
    expect(onePace(ball)).toEqual(ball);
    const short = [ball[0], ball[1], ...stray];
    expect(onePace(short)).toEqual(short);
    const still = [...ball.map((c) => ({ ...c, v: 5 })), ...stray];
    expect(onePace(still)).toEqual(still);
  });

  it("lets two sightings cross by up to FAR_SLACK_FT from FAR_FT on, by half a foot nearer", () => {
    // A ball at 20 ft/s, one frame a pixel low: 1.4 ft short of the frame before.
    const run = (v0: number) => Array.from({ length: 30 }, (_, i) => ({ frame: i, t: i / 60, v: v0 + (20 * i) / 60, u: 20 }));
    const far = run(50);
    far[21] = { ...far[21], v: far[20].v - 1.4 };
    expect(associate(far).map((c) => c.frame)).toContain(21);
    const near = run(10);
    near[21] = { ...near[21], v: near[20].v - 1.4 };
    expect(associate(near).map((c) => c.frame)).not.toContain(21);
    expect(FAR_SLACK_FT).toBeGreaterThan(1.4);
    expect(FAR_FT).toBeLessThan(50);
  });

  it("drops the stray pieces when it associates", () => {
    expect(associate([...ball, ...stray])).toEqual(ball);
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

  it("keeps the ball's shape on noisy sightings: one bend, no weave, marked rough", () => {
    const zig = pts.map((p, i) => ({ ...p, u: 20 + (i % 20 < 10 ? 3 : -3) }));
    const fit = fitPath(zig);
    expect(fit.path.kind).toBe("hook");
    expect(fit.path.rough).toBe(true);
    expect(fit.rms).toBeGreaterThan(ROUGH_RMS);
    // The slope across never turns back: the second differences keep one sign.
    const d2 = Array.from({ length: 58 }, (_, i) => pathU(fit.path, i + 2) - 2 * pathU(fit.path, i + 1) + pathU(fit.path, i));
    expect(d2.every((x) => x * fit.path.k >= -1e-9)).toBe(true);
    // A rough bend is not a measured breakpoint.
    const m = metrics({ path: fit.path, hand: "right", seen: zig.map((p) => p.v), touchdown: 1, motion: { v0: 0, w: 20, d: 0 }, tFirst: 0, tLast: 3, speedMeasured: false });
    expect(m.breakpoint.state).not.toBe("measured");
    expect(fitPath(pts).path.rough).toBeUndefined();
  });

  it("reports a breakpoint only far enough down the lane, with sightings on both sides of it", () => {
    const hook = { kind: "hook" as const, u0: 20, a: 0.2, s: 30, L: 10, k: -0.02 };
    const every = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(breakpointState(40, 1, 60, every, hook)).toBe("measured");
    // The owner's phone on IMG_0047: "board 10.8 at 14 ft", measured. No ball turns there.
    expect(breakpointState(14, 1, 60, every, hook)).toBe("missing");
    expect(breakpointState(BREAKPOINT_FT[1] + 1, 1, 60, every, hook)).toBe("missing");
    // Seen within 15 ft either side but not 5: estimated; further: missing.
    const gappy = every.filter((v) => v < 30 || v > 50);
    expect(breakpointState(40, 1, 60, gappy, hook)).toBe("estimated");
    expect(breakpointState(40, 1, 60, every.filter((v) => v < 20 || v > 50), hook)).toBe("missing");
    expect(breakpointState(40, 1, 60, every.filter((v) => v < 40), hook)).toBe("missing");
    // A loose fit is never measured; the path's own ends are not a breakpoint.
    expect(breakpointState(40, 1, 60, every, { ...hook, rough: true })).toBe("estimated");
    expect(breakpointState(1.2, 1, 60, every, hook)).toBe("missing");
    expect(breakpointState(null, 1, 60, every, hook)).toBe("missing");
  });

  it("gives no board at the pins off the lane, or off the ball's direction when estimated", () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ v: 35 + i, u: 25 - 0.2 * i, w: 1 }));
    // Run on to 59.4 ft the last 10 ft say u 19.1, board 20.9.
    expect(pinsPlausible(20.9, "estimated", line, 54, 59.4, "right")).toBe(true);
    expect(pinsPlausible(36.7, "estimated", line, 54, 59.4, "right")).toBe(false);
    expect(pinsPlausible(36.7, "measured", line, 54, 59.4, "right")).toBe(true);
    expect(pinsPlausible(41, "measured", line, 54, 59.4, "right")).toBe(false);
    expect(pinsPlausible(-1, "measured", line, 54, 59.4, "right")).toBe(false);
    // An estimate with nothing seen to run on from does not stand.
    expect(pinsPlausible(20.9, "estimated", [], 54, 59.4, "right")).toBe(false);
  });

  it("drops the far readings off a path that swings across the lane past the last sighting it trusts", () => {
    // IMG_0047 as the phone traced it: the ball seen to 26 ft drifting out to
    // board 7.7, then a far group by the left gutter the fit swung across to.
    const near = Array.from({ length: 36 }, (_, i) => ({ v: 1.3 + 0.7 * i, u: 26.5 + 0.23 * 0.7 * i, w: 1, sv: 0.1, t: 3.65 + i / 60 }));
    const far = Array.from({ length: 10 }, (_, i) => ({ v: 52 + 0.8 * i, u: 3.5, w: 0.5, sv: 1, t: 5.9 + i / 60 }));
    const pts = [...near, ...far];
    const fit = fitPath(pts);
    const m = metrics({
      path: fit.path, hand: "right", seen: pts.map((p) => p.v), points: pts, touchdown: 1.3,
      motion: { v0: -76, w: 23, d: 0 }, tFirst: pts[0].t, tLast: pts[pts.length - 1].t, speedMeasured: false
    });
    expect(m.pins.state).toBe("missing");
    expect(m.pins.value).toBeNull();
    expect(m.entryAngle.state).toBe("missing");
    expect(m.breakpoint.state).toBe("missing");
    expect(MAX_HOOK_BOARDS).toBeLessThan(36.7 - 7.7);
  });

  it("drops a board at the pins more than a hook away from the path's furthest point out, even with no breakpoint to show", () => {
    // Seen to 14 ft at board 13 and then, after a gap, a far group by the left gutter.
    const near = Array.from({ length: 20 }, (_, i) => ({ v: 1 + 0.7 * i, u: 27, w: 1, sv: 0.1, t: 3.6 + i / 60 }));
    const far = Array.from({ length: 12 }, (_, i) => ({ v: 53 + 0.6 * i, u: 4 + 0.1 * i, w: 1, sv: 1, t: 5.9 + i / 60 }));
    const pts = [...near, ...far];
    const m = metrics({
      path: fitPath(pts).path, hand: "right", seen: pts.map((p) => p.v), points: pts, touchdown: 1,
      motion: { v0: -76, w: 22, d: 0 }, tFirst: pts[0].t, tLast: pts[pts.length - 1].t, speedMeasured: false
    });
    expect(m.breakpoint.state).toBe("missing");
    expect(m.pins.state).toBe("missing");
  });

  it("reads the board at the pins of a straight shot across the lane, which is not hook", () => {
    // IMG_2938: a left-hander's spare at the 10 pin, board 8 at the foul line
    // to 37 at the pins in a straight line, seen to the pins.
    const pts = Array.from({ length: 60 }, (_, i) => {
      const v = 1 + i;
      return { v, u: 8 + 0.48 * v, w: 1, sv: 0.1, t: 3 + v / 22 };
    });
    const m = metrics({
      path: fitPath(pts).path, hand: "left", seen: pts.map((p) => p.v), points: pts, touchdown: 1,
      motion: { v0: -66, w: 22, d: 0 }, tFirst: pts[0].t, tLast: pts[pts.length - 1].t, speedMeasured: false
    });
    expect(m.breakpoint.state).toBe("missing");
    expect(m.pins.state).toBe("measured");
    expect(m.pins.value!).toBeGreaterThan(36);
    expect(m.pins.value!).toBeLessThan(39);
  });

  it("counts hook from the line the ball runs on at its furthest point out", () => {
    const straight = (v: number) => 8 + 0.5 * v;
    // Furthest out where it starts: the line run on to the pins, and none of the boards crossed is hook.
    expect(hookFrom(straight, 0, 0, 60)).toBeCloseTo(38, 9);
    // Turned at 40 ft: the board there.
    const hook = (v: number) => 10 + 0.002 * (v - 40) ** 2;
    expect(hookFrom(hook, 40, 0, 60)).toBe(10);
    // Seen flat from the start: the board there.
    expect(hookFrom(() => 13, 1, 1, 60)).toBe(13);
  });

  it("still reads a spline from a trace made before", () => {
    const old = { kind: "spline" as const, u0: 0, a: 0, s: 0, L: 0, k: 0, knots: [[0, 10], [10, 12], [20, 13]] as [number, number][] };
    expect(pathU(old, 5)).toBeCloseTo(11, 9);
    expect(pathU(old, -10)).toBeCloseTo(8, 9);
    expect(pathU(old, 30)).toBeCloseTo(14, 9);
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
