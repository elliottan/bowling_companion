import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  DO_NOT_USE_BAND,
  EIGHTHS,
  LAYOUT_PRESETS,
  angleToArc,
  arcToAngle,
  coreToPap,
  describeMotion,
  dot,
  drillingAngleForCoreToPap,
  flarePotential,
  formatDualAngle,
  formatInches,
  formatLayoutSpec,
  formatVls,
  fromVls,
  gripHoles,
  GRIP_SPAN,
  layoutSystemFor,
  makeLayoutSpec,
  specToBall,
  specToLayout,
  splitFractionRuns,
  inDoNotUseBand,
  joinInches,
  layoutGeometry,
  normalize,
  papVector,
  pinBuffer,
  presetLayout,
  readMotion,
  splitInches,
  surfaceDistance,
  tangentToward,
  toVls,
  valAngleForBuffer,
  walk,
  type BallSpec,
  type DualAngleLayout,
  type Vec3
} from "./ballLayout";

const BENCHMARK: DualAngleLayout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

describe("arc and angle conversion", () => {
  it("round-trips", () => {
    expect(angleToArc(arcToAngle(4.5))).toBeCloseTo(4.5, 10);
  });

  it("uses the 8.5 inch ball radius", () => {
    expect(BALL_RADIUS).toBe(4.25);
    // A quarter of the way round an 8.5" ball is 6.68", the distance pro shops
    // round to 6 3/4" when they call a pin "on the axis".
    expect(angleToArc(Math.PI / 2)).toBeCloseTo(6.676, 3);
  });
});

describe("vector helpers", () => {
  it("normalizes a zero vector to the pole rather than NaN", () => {
    expect(normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("walks a great circle by the angle asked for", () => {
    const from = { x: 0, y: 0, z: 1 };
    const moved = walk(from, { x: 1, y: 0, z: 0 }, Math.PI / 2);
    expect(moved.x).toBeCloseTo(1, 10);
    expect(moved.z).toBeCloseTo(0, 10);
  });

  it("returns a tangent orthogonal to the point it starts from", () => {
    const from = normalize({ x: 1, y: 2, z: 3 });
    const t = tangentToward(from, normalize({ x: -1, y: 0.5, z: 2 }));
    expect(dot(from, t)).toBeCloseTo(0, 10);
    expect(Math.hypot(t.x, t.y, t.z)).toBeCloseTo(1, 10);
  });
});

describe("PAP placement", () => {
  it("puts the PAP the measured distance from the grip centre", () => {
    const pap = papVector({ over: 5, up: 0 });
    expect(surfaceDistance({ x: 0, y: 0, z: 1 }, pap)).toBeCloseTo(5, 6);
  });

  it("treats a negative up as a PAP below the midline", () => {
    const above = papVector({ over: 5, up: 0.5 });
    const below = papVector({ over: 5, up: -0.5 });
    expect(above.y).toBeGreaterThan(0);
    expect(below.y).toBeCloseTo(-above.y, 10);
  });
});

describe("layoutGeometry", () => {
  const ball = DEFAULT_ASYMMETRIC;

  it("places the pin exactly the pin-to-PAP distance from the PAP", () => {
    for (const d of [0.75, 2, 4.5, 5.5]) {
      const g = layoutGeometry({ ...BENCHMARK, pinToPap: d }, ball);
      expect(surfaceDistance(g.pap, g.pin)).toBeCloseTo(d, 6);
    }
  });

  it("places the core marker the ball's own pin-to-PSA distance from the pin", () => {
    const g = layoutGeometry(BENCHMARK, ball);
    expect(surfaceDistance(g.pin, g.core)).toBeCloseTo(ball.pinToCore, 6);
  });

  it("opens the VAL angle at the PAP, between the pin-to-PAP line and the VAL", () => {
    for (const val of [0, 20, 45, 70, 90]) {
      const g = layoutGeometry({ ...BENCHMARK, valAngle: val }, ball);
      const toPin = tangentToward(g.pap, g.pin);
      const measured = (Math.acos(Math.min(1, Math.max(-1, dot(toPin, g.valDirection)))) * 180) / Math.PI;
      expect(measured).toBeCloseTo(val, 4);
    }
  });

  it("opens the drilling angle at the pin, between pin-to-PAP and pin-to-core", () => {
    for (const drill of [0, 30, 45, 70, 90]) {
      const g = layoutGeometry({ ...BENCHMARK, drillingAngle: drill }, ball);
      const toPap = tangentToward(g.pin, g.pap);
      const toCore = tangentToward(g.pin, g.core);
      const measured = (Math.acos(Math.min(1, Math.max(-1, dot(toPap, toCore)))) * 180) / Math.PI;
      expect(measured).toBeCloseTo(drill, 4);
    }
  });

  it("puts the pin above the grip at a 0 degree VAL angle and beside it at 90", () => {
    const pinUp = layoutGeometry({ ...BENCHMARK, valAngle: 0 }, ball);
    const pinDown = layoutGeometry({ ...BENCHMARK, valAngle: 90 }, ball);
    expect(pinUp.pin.y).toBeGreaterThan(pinDown.pin.y);
    // At 90 degrees the pin lies on the PAP-to-grip great circle itself, so it
    // is coplanar with the PAP and the grip centre: no pin-up component left.
    const g = layoutGeometry(BENCHMARK, ball);
    expect(Math.abs(dot(pinDown.pin, g.valDirection))).toBeCloseTo(0, 6);
    expect(Math.abs(dot(pinUp.pin, g.gripDirection))).toBeCloseTo(0, 6);
  });

  it("clamps out-of-range inputs rather than producing NaN", () => {
    const g = layoutGeometry({ drillingAngle: 200, pinToPap: -3, valAngle: -10 }, ball);
    for (const v of [g.pin, g.core, g.pap]) {
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    }
  });
});

describe("handedness", () => {
  const L = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

  it("mirrors every landmark to the other side of the ball", () => {
    const right = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "right");
    const left = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "left");
    for (const key of ["pap", "pin", "core"] as const) {
      expect(left[key].x).toBeCloseTo(-right[key].x, 10);
      expect(left[key].y).toBeCloseTo(right[key].y, 10);
      expect(left[key].z).toBeCloseTo(right[key].z, 10);
    }
  });

  it("keeps every measured distance and angle identical", () => {
    // A mirror image is the same layout seen from the other side, so the three
    // numbers a driller reads off it cannot change.
    const right = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "right");
    const left = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "left");
    expect(surfaceDistance(left.pin, left.pap)).toBeCloseTo(surfaceDistance(right.pin, right.pap), 10);
    expect(surfaceDistance(left.pin, left.core)).toBeCloseTo(surfaceDistance(right.pin, right.core), 10);
    expect(surfaceDistance(left.core, left.pap)).toBeCloseTo(surfaceDistance(right.core, right.pap), 10);
  });

  it("defaults to a right-hander, which is what the old signature did", () => {
    const explicit = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "right");
    const implied = layoutGeometry(L, DEFAULT_ASYMMETRIC, DEFAULT_PAP);
    expect(implied.pin).toEqual(explicit.pin);
  });
});

describe("pin buffer", () => {
  it("converges on the flat rule of thumb at short distances", () => {
    // Under an inch the sphere barely curves, so spherical and flat agree.
    const flat = (d: number, v: number) => d * Math.sin((v * Math.PI) / 180);
    expect(pinBuffer(0.75, 30)).toBeCloseTo(flat(0.75, 30), 2);
  });

  it("corrects the flat worked example pro shops quote", () => {
    // The familiar "2 1/2 on 5 is 30 degrees" is flat trig on a curved ball.
    expect(valAngleForBuffer(5, 2.5)).toBeCloseTo(37, 0);
    expect(pinBuffer(5, 30)).toBeCloseTo(2.04, 2);
  });

  it("is zero at a 0 degree VAL angle and the full distance at 90", () => {
    expect(pinBuffer(4.5, 0)).toBeCloseTo(0, 10);
    expect(pinBuffer(4.5, 90)).toBeCloseTo(4.5, 6);
  });

  it("round-trips against valAngleForBuffer", () => {
    for (const val of [10, 35, 45, 70, 89]) {
      expect(valAngleForBuffer(4.5, pinBuffer(4.5, val))).toBeCloseTo(val, 4);
    }
  });

  it("is spherical, not flat, and the difference is large enough to matter", () => {
    const flat = 5.5 * Math.sin((45 * Math.PI) / 180);
    expect(Math.abs(pinBuffer(5.5, 45) - flat)).toBeGreaterThan(0.1);
  });

  it("returns a zero angle when there is no pin-to-PAP distance to work with", () => {
    expect(valAngleForBuffer(0, 1)).toBe(0);
  });

  it("agrees with the distance measured off the built geometry", () => {
    const g = layoutGeometry({ ...BENCHMARK, valAngle: 35 }, DEFAULT_ASYMMETRIC);
    // Perpendicular arc from the pin to the VAL great circle, whose pole is the
    // grip direction at the PAP.
    const measured = angleToArc(Math.asin(Math.abs(dot(g.pin, g.gripDirection))));
    expect(measured).toBeCloseTo(pinBuffer(4.5, 35), 6);
  });
});

describe("core-to-PAP distance", () => {
  const ball = DEFAULT_ASYMMETRIC;

  it("is the plain difference when the drilling angle is zero", () => {
    expect(coreToPap({ ...BENCHMARK, drillingAngle: 0 }, ball)).toBeCloseTo(ball.pinToCore - 4.5, 6);
  });

  it("grows as the drilling angle opens", () => {
    const small = coreToPap({ ...BENCHMARK, drillingAngle: 10 }, ball);
    const large = coreToPap({ ...BENCHMARK, drillingAngle: 80 }, ball);
    expect(large).toBeGreaterThan(small);
  });

  it("matches the distance measured off the built geometry", () => {
    for (const drill of [15, 45, 75]) {
      const layout = { ...BENCHMARK, drillingAngle: drill };
      const g = layoutGeometry(layout, ball);
      expect(surfaceDistance(g.core, g.pap)).toBeCloseTo(coreToPap(layout, ball), 6);
    }
  });

  it("round-trips through drillingAngleForCoreToPap", () => {
    for (const drill of [5, 30, 60, 88]) {
      const layout = { ...BENCHMARK, drillingAngle: drill };
      expect(drillingAngleForCoreToPap(4.5, coreToPap(layout, ball), ball)).toBeCloseTo(drill, 4);
    }
  });

  it("degrades to zero rather than dividing by zero at a degenerate distance", () => {
    expect(drillingAngleForCoreToPap(0, 3, ball)).toBe(0);
  });
});

describe("Storm VLS conversion", () => {
  it("writes an asymmetric layout as three numbers and a symmetric one as two", () => {
    expect(toVls(BENCHMARK, DEFAULT_ASYMMETRIC).psaToPap).not.toBeNull();
    expect(toVls(BENCHMARK, DEFAULT_SYMMETRIC).psaToPap).toBeNull();
    expect(formatVls(toVls(BENCHMARK, DEFAULT_SYMMETRIC)).split(" x ")).toHaveLength(2);
  });

  it("round-trips a reachable asymmetric layout exactly", () => {
    const vls = toVls(BENCHMARK, DEFAULT_ASYMMETRIC);
    const back = fromVls(vls, DEFAULT_ASYMMETRIC);
    expect(back.exact).toBe(true);
    expect(back.pinToPap).toBeCloseTo(BENCHMARK.pinToPap, 6);
    expect(back.valAngle).toBeCloseTo(BENCHMARK.valAngle, 4);
    expect(back.drillingAngle).toBeCloseTo(BENCHMARK.drillingAngle, 4);
  });

  it("reports a buffer longer than the pin-to-PAP distance as unreachable", () => {
    const back = fromVls({ pinToPap: 3, psaToPap: 4, pinBuffer: 5 }, DEFAULT_ASYMMETRIC);
    expect(back.exact).toBe(false);
    expect(Number.isFinite(back.valAngle)).toBe(true);
  });

  it("falls back to a mid drilling angle on a symmetric ball, which has no PSA", () => {
    expect(fromVls({ pinToPap: 4.5, psaToPap: null, pinBuffer: 3 }, DEFAULT_SYMMETRIC).drillingAngle).toBe(45);
  });

  it("gives two different asymmetric balls different VLS numbers for the same dual angle", () => {
    const shortPsa: BallSpec = { ...DEFAULT_ASYMMETRIC, pinToCore: 5 };
    expect(toVls(BENCHMARK, shortPsa).psaToPap).not.toBeCloseTo(
      toVls(BENCHMARK, DEFAULT_ASYMMETRIC).psaToPap as number,
      2
    );
  });
});

describe("formatting", () => {
  it("writes inches to the nearest eighth as a mixed fraction", () => {
    expect(formatInches(4)).toBe("4");
    expect(formatInches(4.5)).toBe("4 1/2");
    expect(formatInches(0.75)).toBe("3/4");
    expect(formatInches(5.24)).toBe("5 1/4");
    expect(formatInches(0.02)).toBe("0");
  });

  it("writes a dual angle the way a drill sheet writes it", () => {
    expect(formatDualAngle(BENCHMARK)).toBe("45 x 4 1/2 x 45");
  });
});

describe("inches as whole and eighths", () => {
  it("splits a measurement the way it is written", () => {
    expect(splitInches(5)).toEqual({ whole: 5, eighths: 0, negative: false });
    expect(splitInches(4.5)).toEqual({ whole: 4, eighths: 4, negative: false });
    expect(splitInches(0.125)).toEqual({ whole: 0, eighths: 1, negative: false });
  });

  it("puts the sign on the whole measurement, not on its integer part", () => {
    // Half an inch below the midline is a real PAP, and there is no way to
    // write it as a negative zero.
    expect(splitInches(-0.5)).toEqual({ whole: 0, eighths: 4, negative: true });
    expect(joinInches({ whole: 0, eighths: 4, negative: true })).toBeCloseTo(-0.5, 10);
  });

  it("round-trips every eighth in the range a PAP can sit", () => {
    for (let v = -3; v <= 6.5; v += 0.125) {
      expect(joinInches(splitInches(v))).toBeCloseTo(v, 10);
    }
  });

  it("snaps a decimal that is not an eighth to the nearest one", () => {
    // The field cannot produce this, but a stored value from anywhere else can.
    expect(joinInches(splitInches(5.31))).toBeCloseTo(5.25, 10);
    expect(joinInches(splitInches(5.32))).toBeCloseTo(5.375, 10);
  });

  it("agrees with how formatInches writes the same number", () => {
    for (const v of [0, 0.125, 2.375, 4.5, 5.875]) {
      const { whole, eighths } = splitInches(v);
      const written = eighths === 0 ? `${whole}` : whole === 0 ? EIGHTHS[eighths] : `${whole} ${EIGHTHS[eighths]}`;
      expect(formatInches(v)).toBe(written);
    }
  });
});

describe("flare potential", () => {
  it("is zero with the pin on the PAP and again with the pin on the axis line", () => {
    expect(flarePotential(0, 0.05)).toBeCloseTo(0, 6);
    expect(flarePotential(6.75, 0.05)).toBeCloseTo(0, 6);
  });

  it("peaks inside the chart's high flare band", () => {
    let best = 0;
    let bestAt = 0;
    for (let d = 0; d <= 6.75; d += 0.01) {
      const f = flarePotential(d, 0.05);
      if (f > best) {
        best = f;
        bestAt = d;
      }
    }
    // The chart calls 3 3/8" to 4 1/2" the high flare band; the model peaks in it.
    expect(bestAt).toBeGreaterThan(3.375);
    expect(bestAt).toBeLessThan(4.5);
    expect(best).toBeCloseTo(0.05 / 0.055, 2);
  });

  it("scales with the ball's differential", () => {
    expect(flarePotential(4, 0.02)).toBeLessThan(flarePotential(4, 0.055));
  });
});

describe("the do-not-use band", () => {
  it("covers 2 3/8 to 3 3/8 inches, exclusive of the edges", () => {
    expect(DO_NOT_USE_BAND).toEqual([2.375, 3.375]);
    expect(inDoNotUseBand(2.375)).toBe(false);
    expect(inDoNotUseBand(3)).toBe(true);
    expect(inDoNotUseBand(3.375)).toBe(false);
  });

  it("warns when a layout lands in it", () => {
    const warnings = readMotion({ ...BENCHMARK, pinToPap: 3 }, DEFAULT_ASYMMETRIC).warnings;
    expect(warnings.some((w) => w.includes("thumb hole"))).toBe(true);
  });

  // The band exists to keep the track off the thumb hole, so a grip with no
  // thumb hole has no band. Both the predicate and the warning that reads it.
  it("does not apply to a two-handed grip", () => {
    expect(inDoNotUseBand(3, "2h")).toBe(false);
    expect(inDoNotUseBand(3, "1h")).toBe(true);
    const warnings = readMotion({ ...BENCHMARK, pinToPap: 3 }, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "2h")
      .warnings;
    expect(warnings.some((w) => w.includes("thumb hole"))).toBe(false);
  });

  it("leaves every other warning alone for a two-hander", () => {
    const layout = { ...BENCHMARK, pinToPap: 6 };
    expect(readMotion(layout, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "2h").warnings).toEqual(
      readMotion(layout, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "1h").warnings
    );
  });

  it("moves no motion number for a two-hander", () => {
    const one = readMotion(BENCHMARK, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "1h");
    const two = readMotion(BENCHMARK, DEFAULT_ASYMMETRIC, DEFAULT_PAP, "2h");
    expect(two.flare).toBe(one.flare);
    expect(two.length).toBe(one.length);
    expect(two.angularity).toBe(one.angularity);
    expect(two.strength).toBe(one.strength);
    expect(two.summary).toBe(one.summary);
  });
});

describe("grip holes", () => {
  const CENTER: Vec3 = { x: 0, y: 0, z: 1 };

  it("puts the centre of grip midway between the thumb and the finger row", () => {
    const holes = gripHoles(CENTER, "right", "1h");
    const thumb = holes.find((h) => h.kind === "thumb")!;
    const fingers = holes.filter((h) => h.kind === "finger");

    // The one thing the drawing was getting wrong: the cross the layout is
    // measured from has to sit the same distance from both ends of the span.
    const toThumb = surfaceDistance(CENTER, thumb.point);
    const midFingers = normalize({
      x: fingers[0].point.x + fingers[1].point.x,
      y: fingers[0].point.y + fingers[1].point.y,
      z: fingers[0].point.z + fingers[1].point.z
    });
    expect(toThumb).toBeCloseTo(surfaceDistance(CENTER, midFingers), 6);
    expect(toThumb + surfaceDistance(CENTER, midFingers)).toBeCloseTo(GRIP_SPAN, 6);
  });

  it("drills three holes for one hand and two for two hands", () => {
    expect(gripHoles(CENTER, "right", "1h").map((h) => h.kind)).toEqual([
      "thumb",
      "finger",
      "finger"
    ]);
    expect(gripHoles(CENTER, "right", "2h").map((h) => h.kind)).toEqual(["finger", "finger"]);
  });

  it("centres a two-hander's grip between the finger holes", () => {
    const [left, right] = gripHoles(CENTER, "right", "2h");
    expect(surfaceDistance(CENTER, left.point)).toBeCloseTo(
      surfaceDistance(CENTER, right.point),
      6
    );
    // No thumb to average against, so the centre is the fingers' own midpoint
    // and sits level with them rather than half a span below.
    expect(left.point.y).toBeCloseTo(0, 6);
    expect(right.point.y).toBeCloseTo(0, 6);
  });

  it("mirrors the finger row for a left-hander", () => {
    const right = gripHoles(CENTER, "right", "1h");
    const left = gripHoles(CENTER, "left", "1h");
    for (let i = 0; i < right.length; i += 1) {
      expect(left[i].point.x).toBeCloseTo(-right[i].point.x, 10);
      expect(left[i].point.y).toBeCloseTo(right[i].point.y, 10);
    }
  });

  it("is one-handed when no grip is named", () => {
    expect(gripHoles(CENTER)).toEqual(gripHoles(CENTER, "right", "1h"));
  });
});

describe("motion reading", () => {
  const ball = DEFAULT_ASYMMETRIC;

  it("makes a small VAL angle sharper and earlier than a large one", () => {
    const sharp = readMotion({ ...BENCHMARK, valAngle: 15 }, ball);
    const smooth = readMotion({ ...BENCHMARK, valAngle: 80 }, ball);
    expect(sharp.angularity).toBeGreaterThan(smooth.angularity);
    expect(sharp.length).toBeLessThan(smooth.length);
  });

  it("makes a small drilling angle roll earlier than a large one", () => {
    const early = readMotion({ ...BENCHMARK, drillingAngle: 10 }, ball);
    const late = readMotion({ ...BENCHMARK, drillingAngle: 85 }, ball);
    expect(early.length).toBeLessThan(late.length);
  });

  it("damps the drilling angle hard on a symmetric ball, as the chart says to", () => {
    const swing = (b: BallSpec) =>
      Math.abs(
        readMotion({ ...BENCHMARK, drillingAngle: 85 }, b).length -
          readMotion({ ...BENCHMARK, drillingAngle: 10 }, b).length
      );
    expect(swing(DEFAULT_SYMMETRIC)).toBeLessThan(swing(DEFAULT_ASYMMETRIC) / 2);
  });

  it("keeps every axis inside 0 to 1 across the whole legal input space", () => {
    for (let drill = 0; drill <= 90; drill += 15) {
      for (let val = 0; val <= 90; val += 15) {
        for (let d = 0; d <= 6.5; d += 0.5) {
          for (const b of [DEFAULT_SYMMETRIC, DEFAULT_ASYMMETRIC]) {
            const m = readMotion({ drillingAngle: drill, pinToPap: d, valAngle: val }, b);
            for (const axis of [m.length, m.angularity, m.strength]) {
              expect(axis).toBeGreaterThanOrEqual(0);
              expect(axis).toBeLessThanOrEqual(1);
            }
            expect(m.summary.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("warns about a pin buffer too short to work with", () => {
    const m = readMotion({ ...BENCHMARK, valAngle: 2 }, ball);
    expect(m.warnings.some((w) => w.includes("pin buffer"))).toBe(true);
  });

  it("warns when the pin closes on the axis line", () => {
    const m = readMotion({ ...BENCHMARK, pinToPap: 6 }, ball);
    expect(m.warnings.some((w) => w.includes("5 1/2"))).toBe(true);
  });

  it("warns on an unreachable PAP measurement", () => {
    const m = readMotion(BENCHMARK, ball, { over: 6, up: 4 });
    expect(m.warnings.some((w) => w.includes("reachable axis"))).toBe(true);
  });

  it("notes that a symmetric ball's drilling angle only moves the CG", () => {
    const m = readMotion({ ...BENCHMARK, drillingAngle: 10 }, DEFAULT_SYMMETRIC);
    expect(m.warnings.some((w) => w.includes("only moves the CG"))).toBe(true);
  });

  it("leaves a benchmark layout clean", () => {
    expect(readMotion(BENCHMARK, ball).warnings).toEqual([]);
    expect(readMotion(BENCHMARK, ball, DEFAULT_PAP).flareInches).toBeGreaterThan(4);
  });

  it("describes the three axes in the order the shot happens", () => {
    const low = describeMotion({ flare: 0.1, length: 0.1, angularity: 0.1, strength: 0.1 });
    const high = describeMotion({ flare: 0.9, length: 0.9, angularity: 0.9, strength: 0.9 });
    const mid = describeMotion({ flare: 0.5, length: 0.5, angularity: 0.5, strength: 0.5 });
    expect(low).toContain("Reads the lane early");
    expect(low).toContain("arcs smoothly");
    expect(high).toContain("Saves its energy");
    expect(high).toContain("snaps hard");
    expect(mid).toContain("mid lane");
    expect(mid).toContain("Medium flare");
  });
});

describe("presets", () => {
  it("every preset is drillable: in range and out of the do-not-use band", () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const layout of [preset.symmetric, preset.asymmetric]) {
        expect(layout.drillingAngle).toBeGreaterThanOrEqual(0);
        expect(layout.drillingAngle).toBeLessThanOrEqual(90);
        expect(layout.valAngle).toBeGreaterThanOrEqual(0);
        expect(layout.valAngle).toBeLessThanOrEqual(90);
        expect(inDoNotUseBand(layout.pinToPap)).toBe(false);
      }
    }
  });

  it("hands back the half matching the ball in hand", () => {
    const shortPin = LAYOUT_PRESETS.find((p) => p.id === "short-pin");
    expect(presetLayout(shortPin!, DEFAULT_SYMMETRIC).drillingAngle).toBe(45);
    expect(presetLayout(shortPin!, DEFAULT_ASYMMETRIC).drillingAngle).toBe(30);
  });

  it("reads the benchmark as more flare and the short pin as less", () => {
    const bench = readMotion(LAYOUT_PRESETS[0].asymmetric, DEFAULT_ASYMMETRIC);
    const short = readMotion(LAYOUT_PRESETS[4].asymmetric, DEFAULT_ASYMMETRIC);
    expect(short.flare).toBeLessThan(bench.flare);
  });

  it("reads late-and-angular as sharper than pin-down", () => {
    const late = readMotion(LAYOUT_PRESETS[2].asymmetric, DEFAULT_ASYMMETRIC);
    const down = readMotion(LAYOUT_PRESETS[3].asymmetric, DEFAULT_ASYMMETRIC);
    expect(late.angularity).toBeGreaterThan(down.angularity);
  });
});

describe("valFoot", () => {
  const ball = DEFAULT_ASYMMETRIC;

  it("sits on the VAL, which is what makes it the foot of the buffer", () => {
    const g = layoutGeometry({ drillingAngle: 45, pinToPap: 4.5, valAngle: 40 }, ball);
    // The VAL is the great circle through the PAP perpendicular to the
    // PAP-to-grip line, so its pole is perpendicular to every point on it.
    const pole = normalize(crossOf(g.pap, g.valDirection));
    expect(dot(g.valFoot, pole)).toBeCloseTo(0, 8);
  });

  it("is exactly a pin buffer away from the pin", () => {
    // The drawing measures the third VLS number along this arc, so if the two
    // ever disagreed the picture would be labelling itself wrongly.
    for (const valAngle of [5, 25, 45, 70, 89]) {
      const layout = { drillingAngle: 45, pinToPap: 4.5, valAngle };
      const g = layoutGeometry(layout, ball);
      expect(surfaceDistance(g.pin, g.valFoot)).toBeCloseTo(pinBuffer(4.5, valAngle), 6);
    }
  });

  it("collapses onto the PAP when the pin lies on the VAL itself", () => {
    // A zero VAL angle puts the pin straight up the axis line, so the nearest
    // point of that line to the pin is the pin's own foot on it, and the buffer
    // is nothing.
    const g = layoutGeometry({ drillingAngle: 45, pinToPap: 4.5, valAngle: 0 }, ball);
    expect(surfaceDistance(g.pin, g.valFoot)).toBeCloseTo(0, 6);
  });

  it("mirrors with the rest of the layout for a left-hander", () => {
    const layout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 40 };
    const right = layoutGeometry(layout, ball, DEFAULT_PAP, "right");
    const left = layoutGeometry(layout, ball, DEFAULT_PAP, "left");
    expect(left.valFoot.x).toBeCloseTo(-right.valFoot.x, 10);
    expect(left.valFoot.y).toBeCloseTo(right.valFoot.y, 10);
    expect(left.valFoot.z).toBeCloseTo(right.valFoot.z, 10);
  });
});

describe("fractional runs", () => {
  it("pulls the fraction out of a mixed measurement, inch mark and all", () => {
    expect(splitFractionRuns('4 1/2"')).toEqual([
      { text: "4 ", fraction: false },
      { text: '1/2"', fraction: true }
    ]);
  });

  it("returns a whole number as one run, so nothing is set smaller", () => {
    expect(splitFractionRuns('45')).toEqual([{ text: "45", fraction: false }]);
  });

  it("handles a bare fraction with no whole part", () => {
    expect(splitFractionRuns("1/8")).toEqual([{ text: "1/8", fraction: true }]);
  });

  it("keeps the separators of a three-number layout between the measurements", () => {
    expect(splitFractionRuns("45 x 4 1/2 x 45").map((r) => r.text).join("")).toBe(
      "45 x 4 1/2 x 45"
    );
    expect(splitFractionRuns("45 x 4 1/2 x 45").filter((r) => r.fraction)).toHaveLength(1);
  });

  it("marks every fraction in a reading written entirely in them", () => {
    expect(splitFractionRuns('5 1/2" x 4 1/4" x 2 3/8"').filter((r) => r.fraction)).toHaveLength(3);
  });
});

describe("a layout as a ball keeps it", () => {
  const spec = makeLayoutSpec({ drillingAngle: 50, pinToPap: 4.5, valAngle: 40 }, DEFAULT_ASYMMETRIC);

  it("round-trips the three numbers and the ball's own geometry", () => {
    expect(specToLayout(spec)).toEqual({ drillingAngle: 50, pinToPap: 4.5, valAngle: 40 });
    expect(specToBall(spec).pinToCore).toBe(DEFAULT_ASYMMETRIC.pinToCore);
    expect(specToBall(spec).symmetric).toBe(false);
  });

  it("stores no notation unless one was asked for", () => {
    expect(spec.system).toBeUndefined();
    expect(makeLayoutSpec(specToLayout(spec), DEFAULT_ASYMMETRIC, "vls").system).toBe("vls");
  });

  it("writes the same layout in either notation", () => {
    expect(formatLayoutSpec(spec, "dual")).toBe("50 x 4 1/2 x 40");
    expect(formatLayoutSpec(spec, "vls")).toBe(
      formatVls(toVls(specToLayout(spec), specToBall(spec)))
    );
  });

  it("falls back to the app-wide notation, and lets a ball outrank it", () => {
    expect(layoutSystemFor(spec, "vls")).toBe("vls");
    expect(layoutSystemFor({ ...spec, system: "dual" }, "vls")).toBe("dual");
    expect(layoutSystemFor(undefined, "dual")).toBe("dual");
  });

  it("gives a symmetric ball the CG distance rather than a PSA one", () => {
    const sym = makeLayoutSpec({ drillingAngle: 45, pinToPap: 4, valAngle: 45 }, DEFAULT_SYMMETRIC);
    expect(specToBall(sym).pinToCore).toBe(DEFAULT_SYMMETRIC.pinToCore);
    // No moulded PSA, so VLS is two numbers on it.
    expect(formatLayoutSpec(sym, "vls").split(" x ")).toHaveLength(2);
  });
});

/** The cross product, written out: `ballLayout` keeps its own private and one
 *  use in a test does not earn an export. */
function crossOf(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
