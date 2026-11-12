import type { FrameSource } from "./registration";
import { behindCamera, frameCount, marksFor, renderFrame, truthAt, timeAt, type SyntheticShot } from "./synthetic";
import type { GrayFrame, LaneMarks } from "./types";
import { apply } from "./homography";
import { namedLine, namedPoint, type CalMark } from "./calibrate";
import { handedBoard, hookU, laneU } from "./laneModel";

/**
 * Test support: a synthetic shot as a frame source (frames rendered on first
 * use and kept as bytes), with the marks a careful bowler would make and the
 * true metrics to compare a trace with.
 */
export function syntheticSource(spec: SyntheticShot): FrameSource & { spec: SyntheticShot } {
  const cache = new Map<number, GrayFrame>();
  return {
    spec,
    count: frameCount(spec),
    frame(i: number): GrayFrame {
      let f = cache.get(i);
      if (!f) {
        const r = renderFrame(spec, i);
        f = { ...r, data: Uint8ClampedArray.from(r.data) };
        cache.set(i, f);
      }
      return f;
    }
  };
}

/** The true lines on frame i, each end moved by up to `slop` pixels the way a finger would. */
export function roughMarks(spec: SyntheticShot, i: number, slop = 1.5): LaneMarks {
  const m = marksFor(truthAt(spec, i).camera);
  const j = (p: { x: number; y: number }, k: number) => ({ x: p.x + slop * Math.sin(k * 1.7), y: p.y + slop * Math.cos(k * 2.3) });
  return {
    left: { a: j(m.left.a, 1), b: j(m.left.b, 2) },
    right: { a: j(m.right.a, 3), b: j(m.right.b, 4) },
    foul: { a: j(m.foul.a, 5), b: j(m.foul.b, 6) },
    deck: { a: j(m.deck.a, 7), b: j(m.deck.b, 8) }
  };
}

/** The true handed board at v feet, and the true average speed between two distances. */
export function truthBoard(spec: SyntheticShot, v: number): number {
  return handedBoard(hookU(spec.path, v), spec.hand);
}

export function truthSpeedMph(spec: SyntheticShot, v0: number, v1: number): number {
  return ((v1 - v0) / (timeAt(spec, v1) - timeAt(spec, v0))) * (3600 / 5280);
}


/**
 * The reference synthetic shot: a camera behind the approach, a 17 mph hook
 * to the pocket, a little loft, sensor noise, camera drift and jitter, a ball
 * on the next lane, and optionally a body standing beside the ball's line.
 */
export function standardShot(o: {
  width?: number;
  height?: number;
  fps?: number;
  hand?: "right" | "left";
  side?: number;
  body?: boolean;
  duration?: number;
  seed?: number;
  fill?: number;
}): SyntheticShot {
  const hand = o.hand ?? "right";
  const right = hand === "right";
  return {
    camera: behindCamera({ width: o.width ?? 360, height: o.height ?? 640, fill: o.fill ?? 0.25, side: o.side ?? (right ? 1.5 : -1.5), heightFt: 5 }),
    fps: o.fps ?? 30,
    duration: o.duration ?? 3.6,
    hand,
    path: right ? { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 } : { u0: 16, a: -0.2, s: 36, L: 16, k: 0.025 },
    releaseT: 0.4,
    releaseV: -0.3,
    speedMph: 17,
    decel: -1.2,
    touchdownV: 1.2,
    loft: 0.15,
    noise: 2,
    seed: o.seed ?? 11,
    jitter: 0.0004,
    drift: { yaw: 0.004, pitch: 0.002, roll: 0.003, zoom: 0.01 },
    distractor: true,
    body: o.body ? { u: right ? 7 : 33, v: -1.5, radius: 0.45, height: 4.2 } : undefined
  };
}

/**
 * The lane's own markings on frame i, as a bowler would mark them on the
 * picture (plan revision: calibration from markings): the seven arrows' tips,
 * the 7, 10 and head pins' bases, the foul line across three lanes, and one
 * edge (the left as seen, near the foul line) only. Each point is moved by up
 * to `slop` pixels.
 */
export function laneMarkings(spec: SyntheticShot, i: number, slop = 0.4): CalMark[] {
  const H = truthAt(spec, i).H;
  let k = 0;
  const at = (u: number, v: number) => {
    const p = apply(H, { x: u, y: v });
    k++;
    return { x: p.x + slop * Math.sin(k * 1.7), y: p.y + slop * Math.cos(k * 2.3) };
  };
  const marks: CalMark[] = [];
  for (const name of ["arrow 5", "arrow 10", "arrow 15", "arrow 20", "arrow 25", "arrow 30", "arrow 35", "pin 7", "pin 10", "pin 1"]) {
    const p = namedPoint(name, (b) => laneU(b, spec.hand))!;
    marks.push({ kind: "point", label: name, ...p, at: at(p.u, p.v) });
  }
  marks.push({ kind: "line", label: "foul", ...namedLine("foul")!, at: [at(-40, 0), at(10, 0), at(30, 0), at(80, 0)] });
  marks.push({ kind: "line", label: "left", ...namedLine("left")!, at: [at(0.5, 1), at(0.5, 8)] });
  return marks;
}
