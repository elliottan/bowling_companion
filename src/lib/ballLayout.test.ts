import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  DO_NOT_USE_BAND,
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
  formatVls,
  fromVls,
  inDoNotUseBand,
  layoutGeometry,
  normalize,
  papVector,
  pinBuffer,
  presetLayout,
  readMotion,
  surfaceDistance,
  tangentToward,
  toVls,
  valAngleForBuffer,
  walk,
  type BallSpec,
  type DualAngleLayout
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
