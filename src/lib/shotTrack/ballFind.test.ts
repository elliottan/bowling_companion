import { describe, expect, it } from "vitest";
import { chains, feetLine, findBall, judgeSightings, MIN_SEEN, nearRoi, type Sighting } from "./ballFind";
import { timeAt, truthAt } from "./synthetic";
import { standardShot, syntheticSource } from "./syntheticSource";
import type { GrayFrame } from "./types";

/** A ball rolling up the lane: crossing the foul line at `foul` at `speed` ft/s, seen every `step` seconds from `from` to `to` ft. */
function rolling(foul: number, speed: number, from: number, to: number, step = 1 / 30, u = 20): Sighting[] {
  const out: Sighting[] = [];
  for (let t = foul + from / speed; speed * (t - foul) <= to; t += step) out.push({ t, u: u + 0.1 * speed * (t - foul), v: speed * (t - foul) });
  return out;
}

describe("feetLine", () => {
  it("gives the speed, the foul line crossing and the spread", () => {
    const l = feetLine(rolling(2, 24, 2, 20))!;
    expect(l.speed).toBeCloseTo(24, 6);
    expect(l.foul).toBeCloseTo(2, 6);
    expect(l.rms).toBeLessThan(1e-6);
  });
  it("is null for fewer than two points or one time", () => {
    expect(feetLine([{ t: 1, v: 2 }])).toBeNull();
    expect(feetLine([{ t: 1, v: 2 }, { t: 1, v: 3 }])).toBeNull();
  });
});

describe("judgeSightings", () => {
  it("takes a ball rolling up the lane from near the foul line", () => {
    const j = judgeSightings(rolling(3.6, 24, 2, 28));
    expect(j.seen).not.toBeNull();
    expect(j.seen!.foul).toBeCloseTo(3.6, 3);
    expect(j.seen!.speed).toBeCloseTo(24, 3);
    expect(j.why).toMatch(/at 24\.0 ft\/s/);
  });

  it("does not take a thing standing on the lane, or one that creeps", () => {
    const standing = Array.from({ length: 12 }, (_, k) => ({ t: 1 + k / 30, u: 30, v: 25 + (k % 2) * 0.2 }));
    expect(judgeSightings(standing).seen).toBeNull();
    // Five feet in a second: a walk, not a ball.
    const creeping = Array.from({ length: 30 }, (_, k) => ({ t: 1 + k / 30, u: 30, v: 2 + (5 * k) / 30 }));
    expect(judgeSightings(creeping).seen).toBeNull();
  });

  it("does not take a run that stands still between strays, as a chain can", () => {
    // shot-04 from 0 s: 4.1 to 5 ft and still, then 11.7 ft a tenth of a second later.
    const set = [0.43, 0.47, 0.5, 0.53, 0.57, 0.6].map((t, k) => ({ t, u: 33, v: [4.1, 4.5, 5, 5, 5, 5][k] }));
    set.push({ t: 0.7, u: 31, v: 11.7 });
    expect(judgeSightings(set).seen).toBeNull();
  });

  it("wants enough sightings over enough feet", () => {
    expect(judgeSightings(rolling(1, 24, 2, 4)).why).toMatch(/in a row/);
    expect(judgeSightings(rolling(1, 24, 2, 20).slice(0, MIN_SEEN - 1)).seen).toBeNull();
  });

  it("answers a ball first seen far up the lane, or over the foul line before the frames, as earlier", () => {
    const far = judgeSightings(rolling(3.6, 24, 20, 40));
    expect(far.seen).toBeNull();
    expect(far.earlier).toBeCloseTo(3.6, 3);
    const before = judgeSightings(rolling(3.6, 24, 8, 14), 4);
    expect(before.seen).toBeNull();
    expect(before.earlier).toBeCloseTo(3.6, 3);
    expect(before.why).toMatch(/before these frames/);
  });

  it("joins the pieces of the ball on its line, and not a stray off it", () => {
    const run = rolling(2, 24, 2, 30);
    // Lost behind the bowler for a while: two pieces.
    const pieces = run.filter((p) => p.v < 10 || p.v > 18);
    const stray = { t: pieces[pieces.length - 1].t, u: 5, v: 50 };
    const all = [...pieces, stray];
    const j = judgeSightings(pieces, -Infinity, all);
    expect(j.seen!.sightings.length).toBe(pieces.length);
    expect(j.seen!.sightings.some((p) => p.v === 50)).toBe(false);
    expect(j.seen!.foul).toBeCloseTo(2, 3);
  });

  it("does not take sightings off their line or at no ball's speed", () => {
    const zigzag = rolling(1, 24, 2, 20).map((p, k) => ({ ...p, v: p.v + (k % 2 ? 2.5 : -2.5) }));
    expect(judgeSightings(zigzag).seen).toBeNull();
    const rocket = rolling(1, 80, 2, 30, 1 / 120);
    expect(judgeSightings(rocket).why).toMatch(/ft\/s/);
  });
});

describe("chains", () => {
  it("chains a ball's sightings apart from the bowler and from a ball on the next lane", () => {
    const ball = rolling(1, 24, 2, 20).map((p) => ({ ...p, frame: 0 }));
    const bowler = Array.from({ length: 10 }, (_, k) => ({ t: 1 + k / 30, u: 8, v: 1 + (k % 3) * 0.1, frame: 0 }));
    const next = rolling(1.1, 22, 2, 20, 1 / 30, -14).map((p) => ({ ...p, frame: 0 }));
    const cs = chains([...bowler, ...next, ...ball].reverse());
    expect(cs.slice(0, 2)).toContainEqual(ball);
    expect(cs.slice(0, 2)).toContainEqual(next);
    expect(cs.every((c) => c.every((p) => p.u === c[0].u) || c.every((p) => p.u > 0) || c.every((p) => p.u < 0))).toBe(true);
  });
  it("breaks a chain at a gap in time", () => {
    const run = rolling(1, 24, 2, 20);
    const gapped = [...run.slice(0, 5), ...run.slice(9)];
    const cs = chains(gapped);
    expect(cs.length).toBe(2);
  });
});

describe("findBall", () => {
  const spec = { ...standardShot({ duration: 1.6, seed: 5 }), releaseT: 0.5 };
  const src = syntheticSource(spec);
  const frames: GrayFrame[] = Array.from({ length: src.count }, (_, i) => src.frame(i));
  const lanes = [0, 8, 16, 24, 32, 40].map((frame) => ({ frame, H: truthAt(spec, frame).H, weight: frame === 24 ? 2 : 1 }));

  it("finds the ball rolling up the lane, when it crossed the foul line and how fast", () => {
    const r = findBall(frames, lanes);
    expect(r.seen, r.why).not.toBeNull();
    expect(r.seen!.foul).toBeCloseTo(timeAt(spec, 0), 1);
    expect(r.seen!.speed / (5280 / 3600)).toBeGreaterThan(15);
    expect(r.seen!.speed / (5280 / 3600)).toBeLessThan(18);
    expect(r.candidates).toBeGreaterThan(0);
  }, 60_000);

  it("sees no ball before it is let go", () => {
    const early = { ...spec, releaseT: 5 };
    const s = syntheticSource(early);
    const r = findBall(Array.from({ length: s.count }, (_, i) => s.frame(i)), lanes);
    expect(r.seen).toBeNull();
  }, 60_000);

  it("needs a lane and frames", () => {
    expect(findBall(frames, []).why).toBe("no lane");
    expect(findBall(frames.slice(0, 2), lanes).why).toBe("no lane");
  });

  it("keeps its box on the near lane and inside the picture", () => {
    const H = truthAt(spec, 0).H;
    const roi = nearRoi(H, spec.camera.width, spec.camera.height);
    expect(roi.x0).toBeGreaterThanOrEqual(0);
    expect(roi.y0 + roi.height).toBeLessThanOrEqual(spec.camera.height);
    expect(roi.y0).toBeGreaterThan(0);
  });
});
