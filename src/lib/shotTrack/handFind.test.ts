import { describe, expect, it } from "vitest";
import { bodyAtRelease, BODY_CHANGE, decideHand, driftCue, handNote, hookCue, otherHand, pinsCue, releaseCue, type HandCue } from "./handFind";
import { handedMetrics, type ReadOff } from "./pathFit";
import type { Background } from "./background";
import type { GrayFrame, Mat3, PathModel } from "./types";

/** A right-hander's shot in lane u (boards from the left edge): out to the right, back left past the bend, into the 1-3 pocket. */
const rightPath: PathModel = { kind: "hook", u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 };
const mirror = (p: PathModel): PathModel => ({ ...p, u0: 40 - p.u0, a: -p.a, k: -p.k });

describe("the hand cues", () => {
  it("each votes right for a right-hander's shot and left for its mirror image", () => {
    expect(releaseCue(25, 14).vote).toBe(1);
    expect(releaseCue(15, 26).vote).toBe(-1);
    expect(releaseCue(21, 20).vote).toBeCloseTo(0.25, 6);
    expect(driftCue(16, 21).vote).toBe(1);
    expect(driftCue(24, 19).vote).toBe(-1);
    expect(driftCue(20, 21).boards).toBe(1);
    expect(hookCue(rightPath, 60)!.vote).toBe(1);
    expect(hookCue(mirror(rightPath), 60)!.vote).toBe(-1);
    // The right-hander's pocket is right of the head pin (board 20.5 in u).
    expect(pinsCue(22.5)!.vote).toBeGreaterThan(0.6);
    expect(pinsCue(17.5)!.vote).toBeLessThan(-0.6);
  });

  it("says nothing of a bend it did not see, a straight path, or a ball off the lane at the pins", () => {
    expect(hookCue(rightPath, 40)).toBeNull();
    expect(hookCue({ ...rightPath, kind: "spline" }, 60)).toBeNull();
    expect(hookCue({ ...rightPath, L: 0 }, 60)).toBeNull();
    expect(pinsCue(-2)).toBeNull();
    expect(pinsCue(Number.NaN)).toBeNull();
  });
});

describe("decideHand", () => {
  const right: HandCue[] = [releaseCue(25, 14), driftCue(16, 21), hookCue(rightPath, 60)!, pinsCue(22.5)!];
  const left: HandCue[] = right.map((c) => ({ ...c, vote: -c.vote, boards: -c.boards }));

  it("takes the hand every cue agrees on, whatever the setting", () => {
    expect(decideHand(right, "left")).toMatchObject({ hand: "right", by: "video", confidence: 1 });
    expect(decideHand(left, "right")).toMatchObject({ hand: "left", by: "video", confidence: 1 });
  });

  it("keeps the setting when the cues say too little", () => {
    const weak = decideHand([driftCue(20, 21), pinsCue(20.8)!], "left");
    expect(weak).toMatchObject({ hand: "left", by: "setting", why: "weak" });
    expect(decideHand([], "right")).toMatchObject({ hand: "right", by: "setting", why: "weak", confidence: 0 });
  });

  it("keeps the setting when a strong cue disagrees with the rest", () => {
    const split = decideHand([releaseCue(25, 14), hookCue(rightPath, 60)!, driftCue(24, 19)], "left");
    expect(split.by).toBe("setting");
    expect(split.why).toBe("disagree");
    expect(split.hand).toBe("left");
    expect(split.confidence).toBeCloseTo(2 / 3, 6);
  });

  it("is said in the details with every cue", () => {
    expect(handNote(decideHand(right, "left"))).toMatch(/^right from the video, confidence 1\.00; release 11\.0 boards \(\+1\.00\), drift 5\.0 boards/);
    expect(handNote(decideHand([driftCue(20, 21)], "left"))).toBe("left from the setting, the video said too little, confidence 1.00; drift 1.0 boards (+0.33)");
    expect(handNote(decideHand([releaseCue(25, 14), driftCue(24, 19)], "left"))).toMatch(/^left from the setting, the video disagreed with itself/);
    expect(handNote(decideHand([], "right"))).toBe("right from the setting, the video said too little, confidence 0.00; no cues");
    expect(otherHand("right")).toBe("left");
    expect(otherHand("left")).toBe("right");
  });
});

describe("bodyAtRelease", () => {
  // Lane u to picture x 100 + 10 u, the foul line on row 400 and 5 rows a foot up the lane.
  const H: Mat3 = [10, 0, 100, 0, -5, 400, 0, 0, 1];
  const W = 600;
  const Ht = 500;
  const roi = { x0: 0, y0: 0, width: W, height: Ht };
  const empty = (): Background => ({ width: W, height: Ht, data: new Float32Array(W * Ht).fill(100), t: 0, spread: new Float32Array(W * Ht) });
  const frame = (paint: (x: number, y: number) => number | null): GrayFrame => {
    const data = new Uint8ClampedArray(W * Ht);
    for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) data[y * W + x] = paint(x, y) ?? 100;
    return { width: W, height: Ht, data, t: 0 };
  };
  // The ball over board 25 (x 350), its body standing over boards 10 to 16 (x 200 to 260).
  const ball = (x: number, y: number) => ((x - 350) ** 2 + (y - 380) ** 2 < 400 ? 20 : null);
  const body = (x: number, y: number) => (x >= 200 && x < 260 && y >= 220 && y < 420 ? 30 : null);

  it("places the body's middle in lane u at the foul line, leaving out the ball", () => {
    const u = bodyAtRelease(frame((x, y) => ball(x, y) ?? body(x, y)), empty(), roi, H, 25);
    expect(u).toBeCloseTo(12.95, 6);
    expect(releaseCue(25, u!).vote).toBe(1);
  });

  it("is null with too little of a body, or a lane too small to read", () => {
    expect(bodyAtRelease(frame(ball), empty(), roi, H, 25)).toBeNull();
    // A change under the threshold is not a body.
    expect(bodyAtRelease(frame((x, y) => (body(x, y) === null ? null : 100 + BODY_CHANGE - 1)), empty(), roi, H, 25)).toBeNull();
    // Nor is one where the empty lane itself varies that much.
    const busy = empty();
    busy.spread.fill(20);
    expect(bodyAtRelease(frame(body), busy, roi, H, 25)).toBeNull();
    const tiny: Mat3 = [0.05, 0, 100, 0, -5, 400, 0, 0, 1];
    expect(bodyAtRelease(frame(body), empty(), roi, tiny, 25)).toBeNull();
    const unseen = empty();
    unseen.data.fill(Number.NaN);
    expect(bodyAtRelease(frame(body), unseen, roi, H, 25)).toBeNull();
  });
});

describe("handedMetrics", () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ v: 1 + i, u: 24 + 0.2 * (1 + i), w: 1, t: 0.5 + i * 0.05 }));
  const readOff: ReadOff = {
    path: { kind: "hook", u0: 24, a: 0.2, s: 50, L: 5, k: 0 }, seen: pts.map((p) => p.v), points: pts, touchdown: 1,
    motion: { v0: -10, w: 20, d: 0 }, tFirst: 0.5, tLast: 1.05, speedMeasured: false
  };

  it("reads the same sightings from either gutter", () => {
    const r = handedMetrics({ ...readOff, hand: "right" });
    const l = handedMetrics({ ...readOff, hand: "left" });
    expect(r.laydown.value! + l.laydown.value!).toBeCloseTo(40, 6);
    expect(r.arrows.value! + l.arrows.value!).toBeCloseTo(40, 6);
  });

  it("shows the arrows as estimated when the sightings stop short of them", () => {
    // Seen to 12 ft: the arrows, at 15 ft, are read off the line through what was seen.
    expect(handedMetrics({ ...readOff, hand: "right" }).arrows.state).toBe("estimated");
  });
});
