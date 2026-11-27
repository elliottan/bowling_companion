import { describe, expect, it } from "vitest";
import { makeFrame } from "./image";
import { atFoulLineTime, CHAIN_GAP_FRAMES, chainCandidates, findDisc, followForward, MATCH_MIN, overFoulLine } from "./release";
import type { GrayFrame, Mat3 } from "./types";

// A lane seen square on: x = 100 + 10 u, y = 400 - 5 v (the foul line is row 400).
const H: Mat3 = [10, 0, 100, 0, -5, 400, 0, 0, 1];
const R = 8;

/** A dark ball on a light lane, with a light "hand" over its top. */
function frameWith(cx: number, bottom: number): GrayFrame {
  const f = makeFrame(400, 480, 0, 200);
  const cy = bottom - R;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R) f.data[y * f.width + x] = y < cy - 0.5 * R ? 180 : 30;
    }
  }
  return f;
}

function follow(path: (k: number) => { cx: number; bottom: number }) {
  const frames = Array.from({ length: 11 }, (_, k) => frameWith(path(k).cx, path(k).bottom));
  const last = path(10);
  return overFoulLine((i) => frames[i] ?? null, () => H, 10, { cx: last.cx, cy: last.bottom - R, r: R });
}

describe("the ball over the foul line", () => {
  it("reads the last frame the ball sits on the line, not where it comes lowest", () => {
    // On the line's row from frame 1.5 to 6.5 (lowest at frame 4); the last frame on it is 6.5.
    const r = follow((k) => ({ cx: 300 - 5 * k, bottom: Math.round(406 - 0.8 * (k - 4) ** 2) }));
    expect(r).not.toBeNull();
    expect(r!.reached).toBe(true);
    // The hand over the ball's top pulls the found disc down a pixel or so: a frame of slack.
    expect(Math.abs(r!.at - 6.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.u - (300 - 5 * 6.5 - 100) / 10)).toBeLessThan(0.6);
  });

  it("reads where the ball comes lowest when it never reaches the line", () => {
    // Lowest at frame 5, still 5 px short of the line, then rising again further back.
    const r = follow((k) => ({ cx: 300 - 5 * k, bottom: Math.round(395 - (k - 5) ** 2) }));
    expect(r).not.toBeNull();
    expect(r!.reached).toBe(false);
    expect(Math.abs(r!.at - 5)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.u - 17.5)).toBeLessThan(0.6);
  });

  it("gives up when the ball cannot be followed", () => {
    const blank = makeFrame(400, 480, 0, 200);
    const first = frameWith(250, 390);
    const r = overFoulLine((i) => (i === 10 ? first : blank), () => H, 10, { cx: 250, cy: 382, r: R });
    expect(r).toBeNull();
  });
});

describe("the laydown by time", () => {
  const frames = Array.from({ length: 11 }, (_, k) => frameWith(300 - 5 * k, 380 - k));

  it("reads the ball between the two frames either side of the time it is on the foul line, straight down to the line", () => {
    const r = atFoulLineTime((i) => frames[i] ?? null, () => H, 10, { cx: 250, cy: 370 - R, r: R }, 4.5)!;
    expect(r.by).toBe("time");
    expect(r.at).toBe(4.5);
    expect(r.track[r.track.length - 1].frame).toBe(4);
    // The center at 4.5 is column 277.5; down is straight down on this lane, onto row 400.
    expect(Math.abs(r.point.x - 277.5)).toBeLessThan(0.6);
    expect(r.point.y).toBeCloseTo(400, 6);
    expect(Math.abs(r.u - 17.75)).toBeLessThan(0.06);
  });

  it("is null when the time is not before the first sighting or too far back, or the ball is lost before it", () => {
    const at = (i: number) => frames[i] ?? null;
    expect(atFoulLineTime(at, () => H, 10, { cx: 250, cy: 362, r: R }, 10)).toBeNull();
    expect(atFoulLineTime(at, () => H, 100, { cx: 250, cy: 362, r: R }, 20)).toBeNull();
    const blank = makeFrame(400, 480, 0, 200);
    expect(atFoulLineTime((i) => (i === 10 ? frames[10] : blank), () => H, 10, { cx: 250, cy: 362, r: R }, 6.5)).toBeNull();
    expect(atFoulLineTime((i) => (i >= 8 ? frames[i] : null), () => H, 10, { cx: 250, cy: 362, r: R }, 6.5)).toBeNull();
    expect(atFoulLineTime(() => null, () => H, 10, { cx: 250, cy: 362, r: R }, 6.5)).toBeNull();
  });
});

describe("following the ball forward", () => {
  /** A dark ball with a highlight on its face, so it has a face to match, beside a white "pin" on its left. */
  const ballAt = (cx: number, cy: number, pin = true) => {
    const f = makeFrame(400, 480, 0, 120);
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        // Drawn with soft edges (the share of the pixel covered), so a ball between pixels shows it.
        const cover = Math.max(0, Math.min(1, R + 0.5 - Math.hypot(x - cx, y - cy)));
        const face = 40 + 60 * Math.max(0, Math.min(1, 2.5 - Math.hypot(x - cx - 3, y - cy + 2)));
        const back = pin && x < cx - R - 1 && x > cx - R - 9 && y < cy + R ? 240 : 120;
        f.data[y * f.width + x] = cover * face + (1 - cover) * back;
      }
    }
    return f;
  };
  const path = (k: number) => ({ cx: 200 - 1.3 * k, cy: 300 });

  it("held to the ball's size and row, finds its column by its face to a fraction of a pixel", () => {
    const frames = Array.from({ length: 8 }, (_, k) => ballAt(path(k).cx, path(k).cy));
    const track = followForward((i) => frames[i] ?? null, 0, { cx: 200, cy: 300, r: R }, 6, 0.6, () => ({ cy: 300, r: R }));
    expect(track.map((d) => d.frame)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const d of track) {
      expect(Math.abs(d.cx - path(d.frame).cx)).toBeLessThan(0.3);
      expect(Math.abs(d.cy - 300)).toBeLessThan(0.3);
      expect(d.r).toBe(R);
    }
  });

  it("stops where the face no longer matches or there is no prediction or frame", () => {
    const frames = [ballAt(200, 300), ballAt(198.7, 300), makeFrame(400, 480, 0, 120)];
    const at = (i: number) => frames[i] ?? null;
    expect(followForward(at, 0, { cx: 200, cy: 300, r: R }, 2, 0.6, () => ({ cy: 300, r: R })).map((d) => d.frame)).toEqual([1]);
    expect(followForward(at, 0, { cx: 200, cy: 300, r: R }, 2, 0.6, (i) => (i < 2 ? { cy: 300, r: R } : null))).toHaveLength(1);
    expect(followForward((i) => (i === 0 ? frames[0] : null), 0, { cx: 200, cy: 300, r: R }, 2, 0.6, () => ({ cy: 300, r: R }))).toEqual([]);
    expect(MATCH_MIN).toBeGreaterThan(0);
  });

  it("left free, follows the ball by its darkness and outline", () => {
    const frames = Array.from({ length: 5 }, (_, k) => ballAt(path(k).cx, path(k).cy, false));
    const track = followForward((i) => frames[i] ?? null, 0, { cx: 200, cy: 300, r: R }, 4);
    expect(track).toHaveLength(4);
    for (const d of track) expect(Math.abs(d.cx - path(d.frame).cx)).toBeLessThan(1);
    expect(followForward(() => null, 0, { cx: 200, cy: 300, r: R }, 4)).toEqual([]);
  });

  it("findDisc keeps to its reach up and down", () => {
    const f = ballAt(200, 310, false);
    expect(Math.abs(findDisc(f, { x: 200, y: 300 }, [R], 12)!.cy - 310)).toBeLessThanOrEqual(2);
    expect(findDisc(f, { x: 200, y: 300 }, [R], 12, 2)!.cy).toBe(302);
  });
});

describe("carrying the ball on by the candidates left out", () => {
  // 6602's far end as the detector saw it: the ball 6 pixels across, a pixel
  // left a frame, its mirror image 9 pixels below on some frames.
  const start = { frame: 102, cx: 536, cy: 342, r: 5.8 };
  const at = (frame: number, x: number, y = 342, r = 6.3) => ({ frame, x, y, r });

  it("takes each frame's candidate nearest where the ball was, across frames with none", () => {
    const cands = [at(106, 532), at(106, 532, 351, 7.6), at(107, 532, 344), at(108, 531), at(110, 530), at(111, 528), at(114, 526)];
    expect(chainCandidates(cands, start, 119).map((c) => [c.frame, c.y])).toEqual([[106, 342], [107, 344], [108, 342], [110, 342], [111, 342], [114, 342]]);
    // Not past the frame it is asked to stop at.
    expect(chainCandidates(cands, start, 108).map((c) => c.frame)).toEqual([106, 107, 108]);
  });

  it("stops at a gap longer than it bridges", () => {
    const cands = [at(103, 535), at(104 + CHAIN_GAP_FRAMES + 1, 530)];
    expect(chainCandidates(cands, start, 119).map((c) => c.frame)).toEqual([103]);
    expect(chainCandidates([at(103 + CHAIN_GAP_FRAMES, 533)], start, 119).map((c) => c.frame)).toEqual([103 + CHAIN_GAP_FRAMES]);
  });

  it("leaves out a candidate too far across, up or down, or of another size", () => {
    expect(chainCandidates([at(103, 540)], start, 119)).toEqual([]);
    expect(chainCandidates([at(103, 536, 345)], start, 119)).toEqual([]);
    expect(chainCandidates([at(103, 536, 342, 9)], start, 119)).toEqual([]);
    expect(chainCandidates([at(103, 536, 342, 3.5)], start, 119)).toEqual([]);
  });
});
