import { describe, expect, it } from "vitest";
import { DEFAULT_ASYMMETRIC, layoutGeometry, normalize, surfaceDistance, type Vec3 } from "./ballLayout";
import {
  IDENTITY_ORIENTATION,
  KEY_STEP_PX,
  KEY_STEP_WIDTH,
  MAX_PITCH,
  arcPoints,
  circlePoints,
  clampOrientation,
  dragToOrientation,
  flareAxes,
  orient,
  orientationFacing,
  project,
  splitByDepth,
  toPolyline
} from "./ballProjection";

const unit = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const FRONT: Vec3 = { x: 0, y: 0, z: 1 };

describe("orient", () => {
  it("leaves a point alone at the identity orientation", () => {
    const p = orient(FRONT, IDENTITY_ORIENTATION);
    expect(p.z).toBeCloseTo(1, 10);
  });

  it("keeps points on the unit sphere", () => {
    const v = normalize({ x: 0.3, y: -0.7, z: 0.5 });
    expect(unit(orient(v, { yaw: 1.1, pitch: -0.4 }))).toBeCloseTo(1, 10);
  });

  it("yaws about the vertical, so height is untouched", () => {
    const v = normalize({ x: 0.3, y: 0.6, z: 0.74 });
    expect(orient(v, { yaw: 0.9, pitch: 0 }).y).toBeCloseTo(v.y, 10);
  });

  it("brings the far side round to the front at half a turn", () => {
    expect(orient(FRONT, { yaw: Math.PI, pitch: 0 }).z).toBeCloseTo(-1, 10);
  });
});

describe("project", () => {
  it("puts the facing point at the centre of the drawn circle", () => {
    const p = project(FRONT, IDENTITY_ORIENTATION, 100, 100, 80);
    expect(p.x).toBeCloseTo(100, 10);
    expect(p.y).toBeCloseTo(100, 10);
    expect(p.front).toBe(true);
    expect(p.facing).toBeCloseTo(1, 10);
  });

  it("negates y, because SVG counts down and the ball does not", () => {
    const up = project({ x: 0, y: 1, z: 0 }, IDENTITY_ORIENTATION, 100, 100, 80);
    expect(up.y).toBeCloseTo(20, 10);
  });

  it("lands every point inside the drawn circle, at any orientation", () => {
    for (const yaw of [0, 1, 2.5, 4]) {
      for (const pitch of [-1.2, 0, 0.8]) {
        const p = project(normalize({ x: 0.4, y: 0.5, z: -0.7 }), { yaw, pitch }, 100, 100, 80);
        expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThanOrEqual(80.0001);
      }
    }
  });

  it("reports the far half as behind, with zero facing", () => {
    const back = project({ x: 0, y: 0, z: -1 }, IDENTITY_ORIENTATION, 100, 100, 80);
    expect(back.front).toBe(false);
    expect(back.facing).toBe(0);
  });
});

describe("arcPoints", () => {
  it("starts and ends on the two endpoints", () => {
    const a = normalize({ x: 0, y: 0, z: 1 });
    const b = normalize({ x: 1, y: 0.4, z: 0.3 });
    const pts = arcPoints(a, b, 12);
    expect(pts).toHaveLength(13);
    expect(surfaceDistance(pts[0], a)).toBeCloseTo(0, 8);
    expect(surfaceDistance(pts[pts.length - 1], b)).toBeCloseTo(0, 6);
  });

  it("spaces samples evenly along the arc", () => {
    const a = FRONT;
    const b = normalize({ x: 1, y: 0, z: 1 });
    const pts = arcPoints(a, b, 8);
    const steps = pts.slice(1).map((p, i) => surfaceDistance(pts[i], p));
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 8);
  });

  it("is the shortest path, so its length equals the surface distance", () => {
    const a = FRONT;
    const b = normalize({ x: 0.6, y: 0.6, z: 0.5 });
    const pts = arcPoints(a, b, 200);
    const walked = pts.slice(1).reduce((sum, p, i) => sum + surfaceDistance(pts[i], p), 0);
    expect(walked).toBeCloseTo(surfaceDistance(a, b), 4);
  });

  it("degenerates safely when both ends are the same point", () => {
    expect(arcPoints(FRONT, FRONT, 12)).toHaveLength(2);
  });
});

describe("circlePoints", () => {
  it("closes on itself", () => {
    const pts = circlePoints({ x: 0, y: 1, z: 0 }, FRONT, 24);
    expect(surfaceDistance(pts[0], pts[pts.length - 1])).toBeCloseTo(0, 8);
  });

  it("stays a quarter turn from its pole all the way round", () => {
    const pole = normalize({ x: 0.3, y: 0.8, z: 0.2 });
    for (const p of circlePoints(pole, FRONT, 32)) {
      expect(p.x * pole.x + p.y * pole.y + p.z * pole.z).toBeCloseTo(0, 8);
    }
  });

  it("passes through the point it was given", () => {
    const pts = circlePoints({ x: 0, y: 1, z: 0 }, FRONT, 48);
    expect(Math.min(...pts.map((p) => surfaceDistance(p, FRONT)))).toBeCloseTo(0, 6);
  });
});

describe("splitByDepth", () => {
  it("splits a full circle where it crosses the silhouette", () => {
    // Sampling starts on the front of the ball, so the loop reads front, back,
    // front: two crossings, three runs.
    const runs = splitByDepth(circlePoints({ x: 0, y: 1, z: 0 }, FRONT, 96), IDENTITY_ORIENTATION, 0, 0, 80);
    expect(runs.map((r) => r.front)).toEqual([true, false, true]);
  });

  it("makes the runs meet, so there is no gap at the silhouette", () => {
    const runs = splitByDepth(circlePoints({ x: 0, y: 1, z: 0 }, FRONT, 96), IDENTITY_ORIENTATION, 0, 0, 80);
    const a = runs[0].points[runs[0].points.length - 1];
    const b = runs[1].points[0];
    expect(a.x).toBeCloseTo(b.x, 10);
    expect(a.y).toBeCloseTo(b.y, 10);
  });

  it("leaves an arc wholly in front as a single run", () => {
    const runs = splitByDepth(arcPoints(FRONT, normalize({ x: 0.3, y: 0.2, z: 0.93 }), 24), IDENTITY_ORIENTATION, 0, 0, 80);
    expect(runs).toHaveLength(1);
    expect(runs[0].front).toBe(true);
  });

  it("drops a run too short to stroke", () => {
    expect(splitByDepth([FRONT], IDENTITY_ORIENTATION, 0, 0, 80)).toEqual([]);
  });

  it("writes a polyline attribute", () => {
    const runs = splitByDepth(arcPoints(FRONT, normalize({ x: 0.3, y: 0, z: 0.95 }), 2), IDENTITY_ORIENTATION, 100, 100, 80);
    expect(toPolyline(runs[0])).toMatch(/^[\d.,\- ]+$/);
    expect(toPolyline(runs[0]).split(" ")).toHaveLength(3);
  });
});

describe("orientationFacing", () => {
  it("brings the target square to the viewer", () => {
    for (const target of [
      normalize({ x: 1, y: 0, z: 0 }),
      normalize({ x: -0.4, y: 0.6, z: -0.7 }),
      normalize({ x: 0.2, y: -0.9, z: 0.3 })
    ]) {
      const p = orient(target, orientationFacing(target));
      expect(p.z).toBeCloseTo(1, 6);
    }
  });

  it("clamps rather than tipping past the pole", () => {
    expect(Math.abs(orientationFacing({ x: 0, y: 1, z: 0 }).pitch)).toBeLessThanOrEqual(MAX_PITCH);
  });

  it("finds the pin of a real layout", () => {
    const g = layoutGeometry({ drillingAngle: 45, pinToPap: 4.5, valAngle: 45 }, DEFAULT_ASYMMETRIC);
    const p = project(g.pin, orientationFacing(g.pin), 100, 100, 80);
    expect(p.x).toBeCloseTo(100, 4);
    expect(p.y).toBeCloseTo(100, 4);
    expect(p.front).toBe(true);
  });
});

describe("drag", () => {
  it("turns the ball with the finger, and back again", () => {
    const moved = dragToOrientation(IDENTITY_ORIENTATION, 100, 0, 300);
    expect(moved.yaw).toBeGreaterThan(0);
    expect(dragToOrientation(moved, -100, 0, 300).yaw).toBeCloseTo(0, 10);
  });

  it("drags a full width for a bit over half a turn", () => {
    expect(dragToOrientation(IDENTITY_ORIENTATION, 300, 0, 300).yaw).toBeCloseTo(2 * Math.PI * 0.55, 6);
  });

  it("moves the surface the way the finger moves, on both axes", () => {
    // The only claim worth making about a direct-manipulation control, and the
    // one the old test did not make: it asserted that a finger moving up gave a
    // positive pitch and called that "raises the ball", which is a claim about
    // an internal number wearing the clothes of a claim about behaviour. It
    // passed while the vertical drag was visibly inverted. So project a point
    // and look at where it lands.
    const front = { x: 0, y: 0, z: 1 };
    const at = (o: typeof IDENTITY_ORIENTATION) => project(front, o, 100, 100, 80);
    const rest = at(IDENTITY_ORIENTATION);
    const drag = (dx: number, dy: number) => at(dragToOrientation(IDENTITY_ORIENTATION, dx, dy, 300));

    // Smaller y is higher up the screen.
    expect(drag(0, -40).y).toBeLessThan(rest.y);
    expect(drag(0, 40).y).toBeGreaterThan(rest.y);
    expect(drag(40, 0).x).toBeGreaterThan(rest.x);
    expect(drag(-40, 0).x).toBeLessThan(rest.x);
  });

  it("moves the surface by the same amount either way, so a drag and back is a no-op", () => {
    const front = { x: 0, y: 0, z: 1 };
    const at = (o: typeof IDENTITY_ORIENTATION) => project(front, o, 100, 100, 80);
    const rest = at(IDENTITY_ORIENTATION);
    const up = at(dragToOrientation(IDENTITY_ORIENTATION, 0, -40, 300));
    const down = at(dragToOrientation(IDENTITY_ORIENTATION, 0, 40, 300));
    expect(rest.y - up.y).toBeCloseTo(down.y - rest.y, 6);
  });

  it("gives the keyboard the same directions as the pointer", () => {
    // The key handler goes through dragToOrientation for exactly this reason:
    // the inverted sign had been copied into it, so fixing one place alone
    // would have left the other backwards.
    const front = { x: 0, y: 0, z: 1 };
    const at = (o: typeof IDENTITY_ORIENTATION) => project(front, o, 100, 100, 80);
    const rest = at(IDENTITY_ORIENTATION);
    const key = (dx: number, dy: number) =>
      at(dragToOrientation(IDENTITY_ORIENTATION, dx * KEY_STEP_PX, dy * KEY_STEP_PX, KEY_STEP_WIDTH));

    expect(key(0, -1).y).toBeLessThan(rest.y);   // ArrowUp
    expect(key(0, 1).y).toBeGreaterThan(rest.y); // ArrowDown
    expect(key(1, 0).x).toBeGreaterThan(rest.x); // ArrowRight
    expect(key(-1, 0).x).toBeLessThan(rest.x);   // ArrowLeft
  });

  it("makes one arrow press about fifteen degrees", () => {
    const turned = dragToOrientation(IDENTITY_ORIENTATION, KEY_STEP_PX, 0, KEY_STEP_WIDTH);
    expect((turned.yaw * 180) / Math.PI).toBeCloseTo(15, 0);
  });

  it("stops at the pole instead of flipping the ball over", () => {
    const far = dragToOrientation(IDENTITY_ORIENTATION, 0, 10000, 300);
    expect(far.pitch).toBeCloseTo(MAX_PITCH, 10);
    expect(clampOrientation({ yaw: 0, pitch: -99 }).pitch).toBeCloseTo(-MAX_PITCH, 10);
  });

  it("survives a zero width rather than dividing by it", () => {
    expect(Number.isFinite(dragToOrientation(IDENTITY_ORIENTATION, 10, 10, 0).yaw)).toBe(true);
  });
});

describe("flareAxes", () => {
  const g = layoutGeometry({ drillingAngle: 45, pinToPap: 4.5, valAngle: 45 }, DEFAULT_ASYMMETRIC);

  it("starts at the bowler's own axis", () => {
    expect(surfaceDistance(flareAxes(g.pap, g.pin, 5)[0], g.pap)).toBeCloseTo(0, 8);
  });

  it("spans the flare distance from first ring to last", () => {
    const axes = flareAxes(g.pap, g.pin, 5, 6);
    expect(surfaceDistance(axes[0], axes[axes.length - 1])).toBeCloseTo(5, 6);
  });

  it("migrates toward the core, not away from it", () => {
    const axes = flareAxes(g.pap, g.pin, 5, 6);
    expect(surfaceDistance(axes[axes.length - 1], g.pin)).toBeLessThan(surfaceDistance(axes[0], g.pin));
  });

  it("collapses to a single spot when the layout makes no flare", () => {
    const axes = flareAxes(g.pap, g.pin, 0, 6);
    for (const a of axes) expect(surfaceDistance(a, g.pap)).toBeCloseTo(0, 8);
  });

  it("returns the number of rings asked for, and all on the sphere", () => {
    const axes = flareAxes(g.pap, g.pin, 4, 8);
    expect(axes).toHaveLength(8);
    for (const a of axes) expect(unit(a)).toBeCloseTo(1, 8);
  });
});
