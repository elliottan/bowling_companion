import { describe, expect, it } from "vitest";
import { frameCount, renderFrame } from "./synthetic";
import { standardShot } from "./syntheticSource";
import {
  alone,
  ballRuns,
  blobsOf,
  candidatesOn,
  changedAlone,
  DEFAULT_BAND,
  findShot,
  frameShift,
  isShotRun,
  laneBand,
  laneBands,
  LEAD_SECONDS,
  OTHER_RUN_POINTS,
  OTHER_RUNS,
  readFrom,
  runScale,
  ShotSearch,
  SHORT_VIDEO,
  shrink,
  type Blob,
  type CoarseFrame,
  type ShotFound
} from "./shotStart";

const W = 96;
const H = 160;

/** A still scene with texture (so a camera shift can be found): grey bands and a few dark posts. */
function scene(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const band = Math.floor(y / 12) % 2 ? 150 : 170;
      const post = x % 23 === 3 || x % 23 === 4 ? 60 : 0;
      d[y * W + x] = post || band + ((x * 7 + y * 3) % 5);
    }
  }
  return d;
}

/** A frame: the scene moved by (dx, dy) (the camera turned), with dark squares drawn on it. */
function frame(t: number, squares: { x: number; y: number; r: number; tone?: number }[] = [], dx = 0, dy = 0): CoarseFrame {
  const base = scene();
  const d = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx));
      const sy = Math.min(H - 1, Math.max(0, y - dy));
      d[y * W + x] = base[sy * W + sx];
    }
  }
  for (const s of squares) {
    for (let y = Math.round(s.y - s.r); y <= Math.round(s.y + s.r); y++) {
      for (let x = Math.round(s.x - s.r); x <= Math.round(s.x + s.r); x++) {
        if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = s.tone ?? 30;
      }
    }
  }
  return { width: W, height: H, data: d, t };
}

/**
 * A shot in hand-made frames at 15 a second: `lead` seconds of still scene,
 * then the ball rising up the middle and slowing (as it goes away), then
 * still frames, with `pins` a burst of change just above where it ends.
 */
function handShot(lead: number, opts: { pins?: boolean; x?: number } = {}): CoarseFrame[] {
  const out: CoarseFrame[] = [];
  const fps = 15;
  let t = 0;
  for (; t < lead - 1e-9; t += 1 / fps) out.push(frame(t));
  const x = opts.x ?? W / 2;
  let y = 130;
  let step = 8;
  let r = 3;
  for (let k = 0; k < 10; k++, t += 1 / fps) {
    out.push(frame(t, [{ x, y, r }]));
    y -= step;
    step *= 0.88;
    r = Math.max(1, r - 0.25);
  }
  for (let k = 0; k < 20; k++, t += 1 / fps) {
    // The rack, just above where the ball was last seen, flickering as pins fall.
    const burst = opts.pins && k >= 2 && k < 8 ? [{ x, y: y - 4, r: 5, tone: k % 2 ? 240 : 20 }] : [];
    out.push(frame(t, burst));
  }
  return out;
}

describe("the camera's movement between frames", () => {
  it("finds a shift the scene was moved by, near or around a guess", () => {
    const a = frame(0);
    expect(frameShift(a, frame(0.1, [], 2, -1))).toEqual({ dx: 2, dy: -1 });
    expect(frameShift(a, frame(0.1))).toEqual({ dx: 0, dy: 0 });
    expect(frameShift(a, frame(0.1, [], 6, 4), 2, { dx: 5, dy: 4 })).toEqual({ dx: 6, dy: 4 });
  });

  it("shrinks a frame by averaging blocks", () => {
    const f: CoarseFrame = { width: 4, height: 2, data: new Uint8ClampedArray([0, 10, 20, 30, 40, 50, 60, 70]), t: 1 };
    const s = shrink(f, 2);
    expect([s.width, s.height, s.t]).toEqual([2, 1, 1]);
    expect(Array.from(s.data)).toEqual([25, 45]);
  });
});

describe("what changed in a frame alone", () => {
  it("marks a square present in its own frame and in neither neighbour, darker or lighter", () => {
    const none = { dx: 0, dy: 0 };
    const m = changedAlone(frame(0), frame(0.1, [{ x: 40, y: 60, r: 2 }]), frame(0.2), none, none);
    const parts = blobsOf(m, W, H);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ x: 40, y: 60, area: 25, bw: 5, bh: 5 });
    // A light square too.
    const light = changedAlone(frame(0), frame(0.1, [{ x: 40, y: 60, r: 1, tone: 250 }]), frame(0.2), none, none);
    expect(blobsOf(light, W, H)[0].area).toBe(9);
    // Something that stays (in the frame after too) is not changed alone.
    const stays = changedAlone(frame(0), frame(0.1, [{ x: 40, y: 60, r: 2 }]), frame(0.2, [{ x: 40, y: 60, r: 2 }]), none, none);
    expect(blobsOf(stays, W, H)).toHaveLength(0);
  });

  it("lays each neighbour on the frame by its shift, so a turned camera changes nothing", () => {
    const m = changedAlone(frame(0, [], -1, 0), frame(0.1, [{ x: 40, y: 60, r: 2 }]), frame(0.2, [], 0, 2), { dx: -1, dy: 0 }, { dx: 0, dy: 2 });
    expect(blobsOf(m, W, H).map((b) => b.area)).toEqual([25]);
  });

  it("keeps a blob with little else changing round it, not a hand on a moving body", () => {
    const mask = new Uint8Array(W * H);
    const set = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mask[y * W + x] = 1;
    };
    set(20, 20, 3, 3);
    set(60, 60, 3, 3);
    // A body beside the second.
    set(66, 50, 2, 20);
    const parts = blobsOf(mask, W, H);
    const lone = parts.find((p) => p.x === 21)!;
    const hand = parts.find((p) => p.x === 61)!;
    expect(alone(mask, W, H, lone)).toBe(true);
    expect(alone(mask, W, H, hand)).toBe(false);
  });

  it("offers no candidates on a frame full of change (the camera jolted)", () => {
    const busy = Array.from({ length: 60 }, (_, k) => ({ x: 4 + (k % 10) * 9, y: 10 + Math.floor(k / 10) * 25, r: 0.5 }));
    const none = { dx: 0, dy: 0 };
    expect(candidatesOn(frame(0), frame(0.1, busy), frame(0.2), none, none, 1)).toEqual([]);
  });
});

describe("the ball's run", () => {
  const times = Array.from({ length: 10 }, (_, i) => i / 15);
  const still = times.map(() => ({ dx: 0, dy: 0 }));
  const run = (pts: [number, number][], area = 9): Blob[][] => times.map((_, i) => (pts[i] ? [{ frame: i, x: pts[i][0], y: pts[i][1], area }] : []));

  it("chains a blob going up the middle and slowing, and takes it for the ball", () => {
    const blobs = run([[48, 130], [48, 123], [48, 117.5], [49, 113], [49, 109.5], [49, 107]]);
    const runs = ballRuns(times, blobs, still, H);
    expect(runs[0].map((b) => b.frame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(isShotRun(runs[0], times, still, W, H)).toBe(true);
  });

  it("does not take a run that keeps its pace or gathers it (a sliding foot)", () => {
    const blobs = run([[48, 150], [48, 144], [48, 138], [48, 131], [48, 124]]);
    const runs = ballRuns(times, blobs, still, H);
    expect(runs[0]).toHaveLength(5);
    expect(isShotRun(runs[0], times, still, W, H)).toBe(false);
  });

  it("does not take a run up one side of the picture (the next lane), nor a short one", () => {
    const side = ballRuns(times, run([[10, 130], [10, 123], [10, 117.5], [11, 113], [11, 109.5]]), still, H)[0];
    expect(isShotRun(side, times, still, W, H)).toBe(false);
    const short = ballRuns(times, run([[48, 130], [48, 123], [48, 118]]), still, H)[0];
    expect(isShotRun(short, times, still, W, H)).toBe(false);
  });

  it("does not chain a step down, across, too fast or onto a much larger blob", () => {
    expect(ballRuns(times, run([[48, 100], [48, 105], [48, 110]]), still, H)).toEqual([]);
    expect(ballRuns(times, run([[20, 130], [40, 125], [60, 120]]), still, H)).toEqual([]);
    expect(ballRuns(times, run([[48, 150], [48, 60]]), still, H)).toEqual([]);
    const growing = times.map((_, i) => (i < 2 ? [{ frame: i, x: 48, y: 130 - 6 * i, area: i ? 80 : 9 }] : []));
    expect(ballRuns(times, growing, still, H)).toEqual([]);
  });

  it("measures the rise with the camera's movement taken out", () => {
    // The camera tilts down 3 pixels a frame: the blob's place in the picture drops, the ball still rises.
    const shifts = times.map((_, i) => ({ dx: 0, dy: i ? 3 : 0 }));
    const pts: [number, number][] = [[48, 130], [48, 123], [48, 117.5], [49, 113], [49, 109.5], [49, 107]];
    const blobs = run(pts.map(([x, y], i) => [x, y + 3 * i]));
    const runs = ballRuns(times, blobs, shifts, H);
    expect(runs[0]).toHaveLength(6);
    expect(isShotRun(runs[0], times, shifts, W, H)).toBe(true);
  });
});

describe("finding the shot", () => {
  it("finds the ball's run after a still lead, and the pins hit above where it ends", () => {
    const frames = handShot(3, { pins: true });
    const found = findShot(frames)!;
    expect(found).not.toBeNull();
    expect(found.release).toBeCloseTo(3, 1);
    expect(found.start).toBeCloseTo(found.release - LEAD_SECONDS, 9);
    expect(found.run.length).toBeGreaterThanOrEqual(5);
    expect(found.run[0].x).toBeCloseTo(0.5, 1);
    expect(found.pinHit).not.toBeNull();
    expect(found.pinHit! - found.run[found.run.length - 1].t).toBeGreaterThan(0);
    expect(found.pinHit! - found.run[found.run.length - 1].t).toBeLessThan(1);
    expect(found.confidence).toBeGreaterThan(0.5);
  });

  it("says when the pins were not seen, and never starts before the video", () => {
    const found = findShot(handShot(0.2))!;
    expect(found.pinHit).toBeNull();
    expect(found.start).toBe(0);
  });

  it("finds nothing in a still video, a too short one, or a run up the side", () => {
    expect(findShot(Array.from({ length: 40 }, (_, i) => frame(i / 15)))).toBeNull();
    expect(findShot(handShot(0).slice(0, 4))).toBeNull();
    expect(findShot([])).toBeNull();
    // A run up the side does not pass for the ball's: reported as a guess, for the lane to judge.
    const side = findShot(handShot(1, { x: 8 }))!;
    expect(side.guessed).toBe(true);
    expect(side.run.length).toBeGreaterThanOrEqual(OTHER_RUN_POINTS);
    expect(findShot(handShot(1))!.guessed).toBeUndefined();
  });

  it("of two runs as long, takes the later: the ball's comes after the bowler's slide", () => {
    const first = handShot(0.5).slice(0, 20);
    const second = handShot(0).map((f) => ({ ...f, t: f.t + 2 }));
    const found = findShot([...first, ...second])!;
    expect(found.release).toBeCloseTo(2, 1);
    // The other run is reported beside it, for the lane to judge.
    expect(found.others).toHaveLength(1);
    expect(found.others![0][0].t).toBeCloseTo(0.5, 1);
    expect(OTHER_RUNS).toBeGreaterThanOrEqual(1);
  });

  it("ignores a frame of another size", () => {
    const search = new ShotSearch();
    for (const f of handShot(1)) search.push(f);
    search.push({ width: 10, height: 10, data: new Uint8ClampedArray(100), t: 99 });
    expect(search.finish()?.release).toBeCloseTo(1, 1);
  });

  it("finds a rendered shot near its release", () => {
    // The synthetic shot, still camera, read as the first look reads: 192 wide, 15 a second, video range.
    const spec = { ...standardShot({ width: 192, height: 342, fps: 15, duration: 1.4 }), distractor: false, jitter: 0, drift: undefined };
    const frames: CoarseFrame[] = Array.from({ length: frameCount(spec) }, (_, i) => {
      const f = renderFrame(spec, i);
      return { width: 192, height: 342, data: Uint8ClampedArray.from(f.data, (v) => 16 + (v * 219) / 255), t: f.t };
    });
    const found = findShot(frames)!;
    expect(found).not.toBeNull();
    expect(Math.abs(found.release - spec.releaseT)).toBeLessThan(0.15);
  });
});

describe("what to read", () => {
  const found = (y: number): ShotFound => ({ start: 2, release: 2.6, pinHit: null, confidence: 1, run: [{ t: 2.6, x: 0.5, y }] });

  it("reads from the found start, a short video from its start, and a long one with no shot not at all", () => {
    expect(readFrom(30, found(0.6))).toBe(2);
    expect(readFrom(SHORT_VIDEO, null)).toBe(0);
    expect(readFrom(4, null)).toBe(0);
    expect(readFrom(Number.NaN, null)).toBe(0);
    expect(readFrom(SHORT_VIDEO + 1, null)).toBeNull();
  });

  it("crops a portrait picture round where the run starts, and reads a landscape one whole", () => {
    const band = laneBand(1080, 1920, found(0.6))!;
    expect(band.top).toBeCloseTo(0.3, 9);
    expect(band.bottom).toBeCloseTo(0.74, 9);
    expect(laneBand(1920, 1080, found(0.6))).toBeNull();
    expect(laneBand(1080, 1920, null)).toEqual(DEFAULT_BAND);
    // Kept inside the picture, at its height.
    const low = laneBand(1080, 1920, found(0.95))!;
    expect(low.bottom).toBe(1);
    expect(low.top).toBeCloseTo(0.56, 9);
    const high = laneBand(1080, 1920, found(0.1))!;
    expect(high.top).toBe(0);
    expect(high.bottom).toBeCloseTo(0.44, 9);
  });

  it("tries the clips' own band before the run's, and alone when they are much the same", () => {
    expect(laneBands(1080, 1920, found(0.6))).toEqual([DEFAULT_BAND]);
    const low = laneBands(1080, 1920, found(0.9));
    expect(low).toHaveLength(2);
    expect(low[0]).toEqual(DEFAULT_BAND);
    expect(low[1]!.bottom).toBe(1);
    expect(laneBands(1920, 1080, found(0.6))).toEqual([null]);
  });

  it("judges the ball's pace and rise against a portrait phone video's height at the picture's width", () => {
    // IMG_1996 at the first look's width: its own height.
    expect(runScale(192, 341)).toBe(341);
    // A clip cut from a band of a portrait video, or a landscape video: the height a portrait one would have.
    expect(runScale(192, 143)).toBe(341);
    expect(runScale(192, 108)).toBe(341);
    // Taller than 9 by 16: its own.
    expect(runScale(192, 400)).toBe(400);
  });
});
