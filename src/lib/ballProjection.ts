/**
 * Turning the layout geometry in `ballLayout.ts` into something drawable.
 *
 * The ball is drawn in orthographic projection: the viewer is infinitely far
 * away, so the silhouette is a true circle at every orientation and a surface
 * point at unit vector `v` lands at `(v.x, -v.y)` scaled by the drawn radius.
 * Perspective was not worth it. On a sphere it buys a slightly fatter near
 * side and costs a silhouette that is no longer the circle every other part of
 * the drawing is measured against.
 *
 * The near/far test is then just the sign of `z`, which is what lets a great
 * circle be split into the part in front of the ball and the part behind it
 * without any depth buffer. Drawing the far half faded is the whole reason the
 * ball reads as a sphere rather than as a disc with lines on it.
 *
 * Pure and React-free, per the `lib/` layering rule.
 */

import { clamp, normalize, walk, type Vec3 } from "./ballLayout";

/** Where the ball is being viewed from: two angles, no roll. */
export interface Orientation {
  /** Radians. Spins the ball about the screen's vertical axis. */
  yaw: number;
  /** Radians. Tips the ball toward or away from the viewer, clamped upright. */
  pitch: number;
}

export const IDENTITY_ORIENTATION: Orientation = { yaw: 0, pitch: 0 };

/**
 * The orientation the ball is first shown at.
 *
 * Not the identity, which faces the grip centre square on and so pushes the PAP
 * out to the silhouette: a PAP measured a normal 5 inches across is 1.18
 * radians round the ball, and at the rim it and everything hanging off it is
 * edge on. The yaw here is half that, negative because the PAP lies along +x
 * and `orient` has to bring +x toward the viewer rather than away, which lands
 * the grip and the PAP either side of centre at about 55 percent of the radius.
 * Both are then square enough to the viewer to carry a label.
 */
export const DEFAULT_ORIENTATION: Orientation = { yaw: -0.6, pitch: 0.12 };

/**
 * The opening view for a given hand.
 *
 * A left-handed layout is the right-handed one mirrored, so its PAP sits at -x
 * instead of +x and the yaw that brings the layout into the front half has to
 * turn the other way. Without this a left-hander opened the lab looking at the
 * back of their own ball, with the pin and the PAP sliding off the edge: the
 * geometry was mirrored and the camera was not.
 */
export const defaultOrientationFor = (hand: "left" | "right"): Orientation => ({
  yaw: hand === "left" ? -DEFAULT_ORIENTATION.yaw : DEFAULT_ORIENTATION.yaw,
  pitch: DEFAULT_ORIENTATION.pitch
});

/**
 * Pitch is clamped just shy of straight up or down. Past the pole the ball
 * keeps rotating but the drag reverses direction, which reads as the ball
 * fighting the finger, so the gesture stops there instead.
 */
export const MAX_PITCH = Math.PI / 2 - 0.05;

/**
 * How far round the ball a drag may go, either way from square on.
 *
 * The back of a laid-out ball is nothing: the pin, the core marker, the PAP and
 * the grip all live in the front hemisphere by construction, and a bowler who
 * kept dragging arrived at a blank sphere with a faded line or two showing
 * through it, then had to drag all the way back to find the layout again. A
 * quarter turn either side keeps the grip centre on screen at every orientation
 * and still reaches round far enough to see the PAP square on, which is the
 * furthest anything worth looking at ever sits.
 */
export const MAX_YAW = Math.PI / 2;

export const clampOrientation = (o: Orientation): Orientation => ({
  yaw: clamp(o.yaw, -MAX_YAW, MAX_YAW),
  pitch: clamp(o.pitch, -MAX_PITCH, MAX_PITCH)
});

/** Rotate a ball-space point into view space: yaw about the Y axis, then pitch about X. */
export function orient(v: Vec3, o: Orientation): Vec3 {
  const cy = Math.cos(o.yaw);
  const sy = Math.sin(o.yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;

  const cp = Math.cos(o.pitch);
  const sp = Math.sin(o.pitch);
  return {
    x: x1,
    y: v.y * cp - z1 * sp,
    z: v.y * sp + z1 * cp
  };
}

export interface Projected {
  x: number;
  y: number;
  /** True on the half of the ball facing the viewer. */
  front: boolean;
  /**
   * How square-on the surface is to the viewer, 0 at the silhouette and 1 at
   * the point nearest the camera. Used to fade a label as its marker slides
   * toward the edge, so nothing pops at the rim.
   */
  facing: number;
}

/**
 * Ball-space unit vector to SVG coordinates. `cx`, `cy` and `r` are the drawn
 * circle; y is negated because SVG counts down the screen and the ball does not.
 */
export function project(v: Vec3, o: Orientation, cx: number, cy: number, r: number): Projected {
  const p = orient(v, o);
  return {
    x: cx + p.x * r,
    y: cy - p.y * r,
    front: p.z >= 0,
    facing: clamp(p.z, 0, 1)
  };
}

/**
 * Sample a great-circle arc from `a` to `b` as points on the surface.
 *
 * Every line in a layout drawing is a great circle: the pin-to-PAP line, the
 * pin-to-core line and the VAL are all shortest paths across the ball, which is
 * exactly what a driller's flexible rule lays down. Drawing them as straight
 * screen lines between two projected markers would be wrong by the sagitta of
 * the arc, which at a 5" pin-to-PAP is a visible bow, and would also hide the
 * fact that the line goes round the back at all.
 */
export function arcPoints(a: Vec3, b: Vec3, steps = 48): Vec3[] {
  const dotAB = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const angle = Math.acos(dotAB);
  if (angle < 1e-6) return [a, b];

  // Tangent at `a` heading toward `b`, the same construction ballLayout uses.
  const dir = normalize({
    x: b.x - a.x * dotAB,
    y: b.y - a.y * dotAB,
    z: b.z - a.z * dotAB
  });
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(walk(a, dir, (angle * i) / steps));
  }
  return out;
}

/**
 * Sample a whole great circle, given any point on it and its pole.
 *
 * The VAL and the midline are circles rather than segments: they run all the
 * way round the ball, and a layout drawing shows them that way because the
 * angles are read against the whole line, not against a stub near the marker.
 */
export function circlePoints(pole: Vec3, through: Vec3, steps = 96): Vec3[] {
  const p = normalize(pole);
  const dotPT = p.x * through.x + p.y * through.y + p.z * through.z;
  const start = normalize({
    x: through.x - p.x * dotPT,
    y: through.y - p.y * dotPT,
    z: through.z - p.z * dotPT
  });
  // Second basis vector of the circle's plane: pole cross start.
  const perp: Vec3 = {
    x: p.y * start.z - p.z * start.y,
    y: p.z * start.x - p.x * start.z,
    z: p.x * start.y - p.y * start.x
  };
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (2 * Math.PI * i) / steps;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push(
      normalize({
        x: start.x * c + perp.x * s,
        y: start.y * c + perp.y * s,
        z: start.z * c + perp.z * s
      })
    );
  }
  return out;
}

/**
 * Sample half a great circle, centred on `through` and running `dir` both ways.
 *
 * Half rather than the whole circle, for a line whose job is to give an angle
 * something to be measured against. A full circle wraps all the way round the
 * ball and reads as globe wireframe (the note on the midline in
 * `BallLayoutDiagram` says why); a bare vertex with nothing leaving it leaves
 * the angle hanging in space. A semicircle centred on the vertex is the line
 * as a drill sheet draws it: through the point, out to the silhouette either
 * side, and stopping where the ball turns away.
 */
export function halfCirclePoints(through: Vec3, dir: Vec3, steps = 48): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(walk(through, dir, -Math.PI / 2 + (Math.PI * i) / steps));
  }
  return out;
}

/**
 * Split a sampled path into runs that are all in front or all behind, so each
 * run can be stroked at its own opacity.
 *
 * The split happens between two samples rather than exactly on the silhouette.
 * At 48 samples that is under a degree of arc, far inside a stroke width, and
 * solving for the true crossing would add a case for every arc to gain nothing
 * anyone can see.
 */
export interface PathRun {
  front: boolean;
  points: Array<{ x: number; y: number }>;
}

export function splitByDepth(
  points: Vec3[],
  o: Orientation,
  cx: number,
  cy: number,
  r: number
): PathRun[] {
  const runs: PathRun[] = [];
  let current: PathRun | null = null;
  // Tracked beside `current` rather than read back off it, so the carry below
  // is not an expression that refers to the variable it initialises.
  let previous: { x: number; y: number } | null = null;

  for (const v of points) {
    const p = project(v, o, cx, cy, r);
    const point = { x: p.x, y: p.y };
    if (!current || current.front !== p.front) {
      // Carry the previous point into the new run so the two runs meet at the
      // silhouette instead of leaving a gap the width of one sample.
      current = { front: p.front, points: previous ? [previous] : [] };
      runs.push(current);
    }
    current.points.push(point);
    previous = point;
  }
  return runs.filter((run) => run.points.length > 1);
}

/** An SVG polyline `points` attribute from a run, rounded to keep the DOM small. */
export const toPolyline = (run: PathRun): string =>
  run.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/**
 * The orientation that brings `target` to face the viewer squarely.
 *
 * Used to fly the ball to a named landmark, which is how the drawing answers
 * "where is the PSA from here" without the bowler having to find it by
 * dragging. Yaw and pitch are read straight off the target's components,
 * which is exact because `orient` applies them in that order.
 */
export function orientationFacing(target: Vec3): Orientation {
  const yaw = Math.atan2(-target.x, target.z);
  const pitch = Math.asin(clamp(target.y, -1, 1));
  return clampOrientation({ yaw, pitch });
}

/**
 * Drag distance to rotation. A drag across the full drawn width turns the ball
 * a bit more than half a turn, which is the ratio at which the surface appears
 * to keep up with the finger without overshooting on a flick.
 */
export const DRAG_TURNS_PER_WIDTH = 0.55;

/**
 * Both axes add the delta, and the vertical one is not negated.
 *
 * It was, and the ball fought the finger: dragging up sent the surface down.
 * The reasoning behind the minus was that a finger moving up the screen is a
 * negative `dy`, so the pitch had to go the other way to compensate. That is
 * one negation too many. Raising the pitch tips the ball's top *toward* the
 * viewer, which carries the point under the finger *down* the screen, and
 * `project` then negates y again on the way into SVG coordinates. Two flips
 * cancel; the third was the bug.
 *
 * The lesson is in the test rather than here. The old one asserted that a
 * finger moving up produced a positive pitch and called that "raises the
 * ball", which is an assertion about an internal number dressed up as one
 * about behaviour. It passed while the control was visibly wrong. The test now
 * projects a point and checks where it lands, which is the only claim worth
 * making about a direct-manipulation control: the surface goes where the
 * finger goes.
 */
export function dragToOrientation(
  start: Orientation,
  dx: number,
  dy: number,
  width: number
): Orientation {
  const perPixel = (2 * Math.PI * DRAG_TURNS_PER_WIDTH) / Math.max(width, 1);
  return clampOrientation({
    yaw: start.yaw + dx * perPixel,
    pitch: start.pitch + dy * perPixel
  });
}

/**
 * One arrow key press, as the drag it stands for.
 *
 * The keyboard goes through `dragToOrientation` rather than touching yaw and
 * pitch itself, so the two controls cannot disagree about which way is up.
 * They did: the same inverted sign had been copied into the key handler, so
 * fixing one would have left the other backwards. 28 pixels over this notional
 * width is about 15 degrees.
 */
export const KEY_STEP_PX = 28;
export const KEY_STEP_WIDTH = 360;

/**
 * Track flare rings: where the ball's axis actually sits on each successive
 * revolution as the core migrates.
 *
 * The axis walks from the bowler's PAP toward the ball's own preferred spin
 * axis, and the track rings are the circles the ball rolls on about each of
 * those intermediate axes. Spacing them evenly along that walk is a
 * simplification, since real migration is fastest early, but the picture it
 * makes is the right one: a stack of rings whose spread is the flare and whose
 * direction points at the core.
 */
export function flareAxes(pap: Vec3, towardCore: Vec3, flareInches: number, rings = 6): Vec3[] {
  const total = flareInches / 4.25; // arc inches to radians on the ball
  const dotPC = clamp(pap.x * towardCore.x + pap.y * towardCore.y + pap.z * towardCore.z, -1, 1);
  const dir = normalize({
    x: towardCore.x - pap.x * dotPC,
    y: towardCore.y - pap.y * dotPC,
    z: towardCore.z - pap.z * dotPC
  });
  const out: Vec3[] = [];
  for (let i = 0; i < rings; i += 1) {
    out.push(walk(pap, dir, (total * i) / Math.max(rings - 1, 1)));
  }
  return out;
}
