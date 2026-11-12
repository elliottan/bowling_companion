import type { Handedness } from "../../types/bowling";
import { arrowFeet } from "../laneGeometry";
import { PIN_POSITIONS } from "../pinGeometry";
import { solveHomography } from "./homography";
import {
  BALL_RADIUS_FT,
  BOARD_IN,
  DECK_END_FT,
  LANE_CORNERS,
  LANE_WIDTH_IN,
  LEFT_U,
  PIN_BELLY_IN,
  PIN_HEIGHT_FT,
  RIGHT_U,
  hookU,
  laneToWorld,
  worldToLane,
  type HookShape
} from "./laneModel";
import type { GrayFrame, LaneMarks, Mat3, Point } from "./types";

/**
 * Test support: renders grey frames of a lane from a pinhole camera, with a
 * ball on a path known exactly (plan 10.1). Ray traced per pixel, so the ball,
 * its reflection and the pins are exact for the camera model.
 *
 * World frame, feet: x across from the lane's centre (to the right as seen
 * from the foul line), y down-lane from the foul line, z up from the lane.
 */

export type Vec3 = [number, number, number];

export interface Camera {
  /** Position, world feet. */
  x: number;
  y: number;
  z: number;
  /** Heading about z (0 looks down-lane, positive turns right), radians. */
  yaw: number;
  /** Positive looks down, radians. */
  pitch: number;
  /** Positive turns the picture clockwise, radians. */
  roll: number;
  /** Focal length in pixels. */
  focal: number;
  width: number;
  height: number;
}

interface Basis {
  c: Vec3;
  r: Vec3;
  u: Vec3;
  f: Vec3;
}

function basis(cam: Camera): Basis {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const f: Vec3 = [sy * cp, cy * cp, -sp];
  const r0: Vec3 = [cy, -sy, 0];
  const u0: Vec3 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);
  // Rolling the camera clockwise turns its right vector down.
  const r: Vec3 = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
  const u: Vec3 = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr];
  return { c: [cam.x, cam.y, cam.z], r, u, f };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Pixel of a world point, or null when it is behind the camera. */
export function project(cam: Camera, p: Vec3): Point | null {
  const B = basis(cam);
  const d: Vec3 = [p[0] - B.c[0], p[1] - B.c[1], p[2] - B.c[2]];
  const zf = dot(d, B.f);
  if (zf <= 1e-9) return null;
  return {
    x: (cam.width - 1) / 2 + (cam.focal * dot(d, B.r)) / zf,
    y: (cam.height - 1) / 2 - (cam.focal * dot(d, B.u)) / zf
  };
}

/** Yaw and pitch that look from `from` at `to`. */
export function lookAt(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return { yaw: Math.atan2(dx, dy), pitch: -Math.atan2(dz, Math.hypot(dx, dy)) };
}

/** Lane (u, v) to image homography for this camera, exact. */
export function laneHomography(cam: Camera): Mat3 {
  const img = LANE_CORNERS.map((c) => {
    const w = laneToWorld(c.x, c.y);
    const p = project(cam, [w.x, w.y, 0]);
    if (!p) throw new Error("lane corner behind the camera");
    return p;
  });
  return solveHomography(LANE_CORNERS, img);
}

/** The four lines a bowler would mark, as the camera sees them. */
export function marksFor(cam: Camera): LaneMarks {
  const at = (u: number, v: number) => {
    const w = laneToWorld(u, v);
    return project(cam, [w.x, w.y, 0]) as Point;
  };
  return {
    left: { a: at(LEFT_U, 0), b: at(LEFT_U, DECK_END_FT) },
    right: { a: at(RIGHT_U, 0), b: at(RIGHT_U, DECK_END_FT) },
    foul: { a: at(LEFT_U, 0), b: at(RIGHT_U, 0) },
    deck: { a: at(LEFT_U, DECK_END_FT), b: at(RIGHT_U, DECK_END_FT) }
  };
}

/** Seeded uniform random numbers (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export interface SyntheticShot {
  camera: Camera;
  fps: number;
  /** Seconds of clip. */
  duration: number;
  hand: Handedness;
  /** Path across the lane, in lane u. */
  path: HookShape;
  /** Seconds into the clip the ball leaves the hand. */
  releaseT: number;
  /** Feet from the foul line at release (usually a little behind it, negative). */
  releaseV: number;
  /** Down-lane speed at release, miles an hour. */
  speedMph: number;
  /** Down-lane acceleration, ft/s^2, zero or negative. */
  decel: number;
  /** Where the ball first touches the lane, feet. Equal to releaseV for no loft. */
  touchdownV: number;
  /** Height of the ball's bottom above the lane at release, feet. */
  loft: number;
  /** Camera turn per second (radians) and zoom change per second (fraction). */
  drift?: { yaw: number; pitch: number; roll: number; zoom: number };
  /** Random camera turn per frame, radians, standard deviation. */
  jitter?: number;
  /** Sensor noise, grey levels, standard deviation. */
  noise?: number;
  seed?: number;
  /** A dark standing body (a vertical cylinder) on the lane. */
  body?: { u: number; v: number; radius: number; height: number };
  /** A second ball rolling down the lane to the left. */
  distractor?: boolean;
  /** Fraction of the frame interval the shutter is open (motion blur). */
  shutter?: number;
}

export interface FrameTruth {
  t: number;
  camera: Camera;
  H: Mat3;
  /** The ball's contact point, or null before release or after the pit. */
  ball: { u: number; v: number; height: number } | null;
  pinsStanding: boolean;
}

const MPH = 5280 / 3600;
/** Lane, gutters and caps repeat across the house with this pitch, inches. */
const GUTTER_IN = 9.25;
const CAP_IN = 6;
const PITCH_IN = LANE_WIDTH_IN + 2 * GUTTER_IN + CAP_IN;
const CEILING_FT = 10;
const WALL_FT = 70;
/** Ball centre at first contact with the head pin, feet (plan 7.6). */
export const PIN_HIT_FT = 60 - 6.07 / 12;

export function ballDistance(spec: SyntheticShot, t: number): number | null {
  const dt = t - spec.releaseT;
  if (dt < 0) return null;
  const w = spec.speedMph * MPH;
  const v = spec.releaseV + w * dt + 0.5 * spec.decel * dt * dt;
  return v > DECK_END_FT + 1 ? null : v;
}

/** Time the ball centre reaches `v` feet (inverse of ballDistance). */
export function timeAt(spec: SyntheticShot, v: number): number {
  const w = spec.speedMph * MPH;
  const d = spec.decel;
  const s = v - spec.releaseV;
  const dt = Math.abs(d) < 1e-9 ? s / w : (-w + Math.sqrt(w * w + 2 * d * s)) / d;
  return spec.releaseT + dt;
}

function ballHeight(spec: SyntheticShot, v: number): number {
  if (v >= spec.touchdownV || spec.touchdownV <= spec.releaseV) return 0;
  const f = (v - spec.releaseV) / (spec.touchdownV - spec.releaseV);
  return spec.loft * (1 - f * f);
}

/** The camera for frame i: drift plus seeded jitter. */
export function cameraAt(spec: SyntheticShot, i: number): Camera {
  const t = i / spec.fps;
  const r = rng((spec.seed ?? 1) * 7919 + i);
  const j = spec.jitter ?? 0;
  const d = spec.drift ?? { yaw: 0, pitch: 0, roll: 0, zoom: 0 };
  return {
    ...spec.camera,
    yaw: spec.camera.yaw + d.yaw * t + j * gaussian(r),
    pitch: spec.camera.pitch + d.pitch * t + j * gaussian(r),
    roll: spec.camera.roll + d.roll * t + j * gaussian(r),
    focal: spec.camera.focal * (1 + d.zoom * t)
  };
}

export function frameCount(spec: SyntheticShot): number {
  return Math.round(spec.duration * spec.fps);
}

export function truthAt(spec: SyntheticShot, i: number): FrameTruth {
  const t = i / spec.fps;
  const camera = cameraAt(spec, i);
  const v = ballDistance(spec, t);
  return {
    t,
    camera,
    H: laneHomography(camera),
    ball: v === null ? null : { u: hookU(spec.path, Math.max(v, 0)), v, height: ballHeight(spec, v) },
    pinsStanding: v === null ? timeAt(spec, PIN_HIT_FT) > t : v < PIN_HIT_FT
  };
}

interface Sphere {
  c: Vec3;
  tone: number;
}

function hitSphere(o: Vec3, d: Vec3, s: Vec3, R: number): number {
  const ox = o[0] - s[0];
  const oy = o[1] - s[1];
  const oz = o[2] - s[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - R * R;
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t > 1e-6 ? t : Infinity;
}

/** Nearest hit of a ray with a vertical cylinder standing on the lane. */
function hitCylinder(o: Vec3, d: Vec3, cx: number, cy: number, R: number, h: number): number {
  const ox = o[0] - cx;
  const oy = o[1] - cy;
  const a = d[0] * d[0] + d[1] * d[1];
  if (a < 1e-12) return Infinity;
  const b = ox * d[0] + oy * d[1];
  const c = ox * ox + oy * oy - R * R;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t <= 1e-6) return Infinity;
  const z = o[2] + t * d[2];
  return z >= 0 && z <= h ? t : Infinity;
}

/** Grey level of the floor at world (x, y). */
function floorTone(x: number, y: number): number {
  if (y > DECK_END_FT) return 30;
  const { u } = worldToLane(x, y);
  const fromLeft = (u - LEFT_U) * BOARD_IN;
  const m = (((fromLeft + GUTTER_IN + CAP_IN) % PITCH_IN) + PITCH_IN) % PITCH_IN - GUTTER_IN - CAP_IN;
  if (y < 0) return m >= -GUTTER_IN && m < LANE_WIDTH_IN + GUTTER_IN ? 150 : 200;
  if (m >= 0 && m < LANE_WIDTH_IN) {
    const inLane = Math.abs(fromLeft - m) < 1e-6;
    if (y < 0.04 && inLane) return 40;
    if (inLane && y > 10 && y < 18) {
      for (let b = 5; b <= 35; b += 5) {
        const tip = arrowFeet(b);
        if (y <= tip && y >= tip - 0.6 && Math.abs(u - b) < (0.6 * (tip - y)) / 0.6) return 70;
      }
    }
    const board = Math.floor(m / BOARD_IN);
    return 172 + ((board * 37) % 7) - 3;
  }
  if (m < 0 && m >= -GUTTER_IN) return 95;
  if (m >= LANE_WIDTH_IN && m < LANE_WIDTH_IN + GUTTER_IN) return 95;
  return 215;
}

function skyTone(o: Vec3, d: Vec3): number {
  // Back wall (masking units) and a textured ceiling, so the top of the
  // picture has the static texture the coarse pass registers on.
  const tw = d[1] > 1e-9 ? (WALL_FT - o[1]) / d[1] : Infinity;
  const tc = d[2] > 1e-9 ? (CEILING_FT - o[2]) / d[2] : Infinity;
  if (tw < tc) {
    const x = o[0] + tw * d[0];
    const z = o[2] + tw * d[2];
    if (z < 2.5) return 25;
    return 120 + 50 * Math.sign(Math.sin(x * 1.7) * Math.sin(z * 2.3));
  }
  if (tc < Infinity) {
    const x = o[0] + tc * d[0];
    const y = o[1] + tc * d[1];
    return 190 + 40 * Math.sign(Math.sin(x * 0.9) * Math.sin(y * 0.6));
  }
  return 180;
}

/** Render frame i of a synthetic shot. Pixels are 0 to 255 floats. */
export function renderFrame(spec: SyntheticShot, i: number): GrayFrame {
  const cam = cameraAt(spec, i);
  const { width: W, height: Hh } = cam;
  const B = basis(cam);
  const t = i / spec.fps;
  const out = new Float32Array(W * Hh);
  const R = BALL_RADIUS_FT;
  const pinR = PIN_BELLY_IN / 2 / 12;
  const standing = (ballDistance(spec, t) ?? (t > spec.releaseT ? Infinity : -Infinity)) < PIN_HIT_FT;
  const pins = standing
    ? Object.values(PIN_POSITIONS).map((p) => laneToWorld(p.board, p.feet))
    : [];
  // Sub-samples of the moving balls across the open shutter.
  const S = 4;
  const shutter = spec.shutter ?? 0.5;
  const balls: Sphere[][] = [];
  for (let k = 0; k < S; k++) {
    const tk = t + ((k + 0.5) / S - 0.5) * (shutter / spec.fps);
    const set: Sphere[] = [];
    const v = ballDistance(spec, tk);
    if (v !== null) {
      const w = laneToWorld(hookU(spec.path, Math.max(v, 0)), v);
      set.push({ c: [w.x, w.y, R + ballHeight(spec, v)], tone: 45 });
    }
    if (spec.distractor) {
      const dv = 5 + 22 * tk;
      if (dv < DECK_END_FT) {
        const w = laneToWorld(20 - PITCH_IN / BOARD_IN + 0.2 * dv, dv);
        set.push({ c: [w.x, w.y, R], tone: 55 });
      }
    }
    balls.push(set);
  }
  const body = spec.body ? { ...laneToWorld(spec.body.u, spec.body.v), r: spec.body.radius, h: spec.body.height } : null;
  const bodyX = body ? body.x + 0.4 * Math.sin(t * 2) : 0;

  // Picture boxes outside which the pins and the balls cannot be hit, so the
  // per-pixel ray tests run only where they matter.
  const boxOf = (pts: Vec3[], pad: number) => {
    const ps = pts.map((q) => project(cam, q)).filter((q): q is Point => q !== null);
    if (ps.length < pts.length) return { x0: 0, y0: 0, x1: W, y1: Hh };
    return {
      x0: Math.min(...ps.map((q) => q.x)) - pad, x1: Math.max(...ps.map((q) => q.x)) + pad,
      y0: Math.min(...ps.map((q) => q.y)) - pad, y1: Math.max(...ps.map((q) => q.y)) + pad
    };
  };
  const inBox = (b: { x0: number; y0: number; x1: number; y1: number } | null, x: number, y: number) =>
    b !== null && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  const rackBox = pins.length
    ? boxOf(pins.flatMap((p) => [-pinR, pinR].flatMap((d) => [[p.x + d, p.y, 0], [p.x + d, p.y, PIN_HEIGHT_FT]] as Vec3[])), 2)
    : null;
  const ballPts: Vec3[] = balls.flat().flatMap((b) =>
    [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => [b.c[0] + sx * R, b.c[1] + sy * R, sz * (b.c[2] + R)] as Vec3)))
  );
  const ballBox = ballPts.length ? boxOf(ballPts, 3) : null;
  const cx = (W - 1) / 2;
  const cy = (Hh - 1) / 2;
  const o = B.c;
  for (let py = 0; py < Hh; py++) {
    for (let px = 0; px < W; px++) {
      const a = (px - cx) / cam.focal;
      const b = -(py - cy) / cam.focal;
      const d: Vec3 = [
        B.f[0] + a * B.r[0] + b * B.u[0],
        B.f[1] + a * B.r[1] + b * B.u[1],
        B.f[2] + a * B.r[2] + b * B.u[2]
      ];
      // The static scene: floor, walls, pins, body.
      let tone: number;
      let tFloor = Infinity;
      let fx = 0;
      let fy = 0;
      if (d[2] < -1e-9) {
        tFloor = -o[2] / d[2];
        fx = o[0] + tFloor * d[0];
        fy = o[1] + tFloor * d[1];
        if (fy > WALL_FT) tFloor = Infinity;
      }
      let tNear = tFloor;
      tone = tFloor < Infinity ? floorTone(fx, fy) : skyTone(o, d);
      if (inBox(rackBox, px, py)) for (const p of pins) {
        const tp = hitCylinder(o, d, p.x, p.y, pinR, PIN_HEIGHT_FT);
        if (tp < tNear) {
          tNear = tp;
          tone = 238;
        }
      }
      if (body) {
        const tb = hitCylinder(o, d, bodyX, body.y, body.r, body.h);
        if (tb < tNear) {
          tNear = tb;
          tone = 50;
        }
      }
      // The moving balls and their mirror images, averaged over the shutter.
      if (inBox(ballBox, px, py)) {
        const floorIsLane = tFloor === tNear && tFloor < Infinity && fy >= 0 && fy <= DECK_END_FT;
        let acc = 0;
        for (const set of balls) {
          let tk = tone;
          let best = tNear;
          for (const s of set) {
            const ts = hitSphere(o, d, s.c, R);
            if (ts < best) {
              best = ts;
              const nz = (o[2] + ts * d[2] - s.c[2]) / R;
              tk = s.tone + 25 * nz;
            }
          }
          if (best === tNear && floorIsLane) {
            const rd: Vec3 = [d[0], d[1], -d[2]];
            for (const s of set) {
              if (hitSphere([fx, fy, 0], rd, s.c, R) < Infinity) {
                tk = 0.55 * tone + 0.45 * s.tone;
                break;
              }
            }
          }
          acc += tk;
        }
        tone = acc / balls.length;
      }
      out[py * W + px] = tone;
    }
  }
  if (spec.noise) {
    const r = rng((spec.seed ?? 1) * 104729 + i);
    for (let k = 0; k < out.length; k++) out[k] = Math.max(0, Math.min(255, out[k] + spec.noise * gaussian(r)));
  }
  return { width: W, height: Hh, data: out, t };
}

/** A camera behind the foul line aimed down the lane, the shape of the sample clips. */
export function behindCamera(opts: {
  width: number;
  height: number;
  /** Feet behind the foul line. */
  back?: number;
  /** Feet to the right of the lane's centre. */
  side?: number;
  /** Feet above the lane. */
  heightFt?: number;
  /** Fraction of the picture's width the lane spans at the pins. */
  fill?: number;
  roll?: number;
}): Camera {
  const back = opts.back ?? 30;
  const side = opts.side ?? 1.5;
  const z = opts.heightFt ?? 5;
  const from: Vec3 = [side, -back, z];
  const aim = lookAt(from, [0, 34, 0]);
  const base: Camera = { x: side, y: -back, z, ...aim, roll: opts.roll ?? 0, focal: 1, width: opts.width, height: opts.height };
  // Choose the focal length so the lane at the pins spans `fill` of the width.
  const a = project(base, [laneToWorld(LEFT_U, 60).x, 60, 0]) as Point;
  const b = project(base, [laneToWorld(RIGHT_U, 60).x, 60, 0]) as Point;
  const focal = ((opts.fill ?? 0.12) * opts.width) / Math.abs(b.x - a.x);
  return { ...base, focal };
}

