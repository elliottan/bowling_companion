import { describe, expect, it } from "vitest";
import { entrySpeed, launchSpeed, lineSpeed, type TimedPoint } from "./speeds";

const MPH = 3600 / 5280;

/**
 * A ball that slows evenly from `v0` ft/s at the foul line by `decel` ft/s
 * each second, seen every `dt` seconds from `from` to `to` feet, with an
 * optional wobble on each distance (a far sighting's pixel jumps).
 */
function slowing(v0: number, decel: number, from: number, to: number, dt = 1 / 60, wobble = 0): TimedPoint[] {
  const out: TimedPoint[] = [];
  for (let k = 0; ; k++) {
    const t = k * dt;
    const v = v0 * t - 0.5 * decel * t * t;
    if (v > to) break;
    if (v >= from) out.push({ t, v: v + wobble * Math.sin(k * 2.3) });
  }
  return out;
}

/** Speed at distance `x` of that ball, ft/s. */
function speedAt(v0: number, decel: number, x: number): number {
  return Math.sqrt(v0 * v0 - 2 * decel * x);
}

describe("lineSpeed", () => {
  it("is the slope of a straight run", () => {
    expect(lineSpeed([{ t: 0, v: 1 }, { t: 1, v: 26 }, { t: 2, v: 51 }])).toBeCloseTo(25, 6);
  });

  it("is null for one point or no spread in time", () => {
    expect(lineSpeed([{ t: 1, v: 3 }])).toBeNull();
    expect(lineSpeed([{ t: 1, v: 3 }, { t: 1, v: 5 }])).toBeNull();
    expect(lineSpeed([{ t: 1, v: 3, w: 0 }, { t: 2, v: 5, w: 0 }])).toBeNull();
  });

  it("drops a sighting far off the line", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ t: i / 60, v: 45 + (22 * i) / 60 }));
    pts[10] = { ...pts[10], v: pts[10].v + 6 };
    expect(lineSpeed(pts)).toBeCloseTo(22, 3);
  });
});

describe("launch and entry speed", () => {
  // 19 mph at the foul line, losing 1.5 ft/s each second: about 16.9 mph at the pins.
  const v0 = 19 / MPH;
  const decel = 1.5;
  const whole = slowing(v0, decel, 1.5, 62, 1 / 60, 0.15);

  it("reads the launch speed off the first 15 ft and the entry speed off the last 15 before the head pin", () => {
    const launch = launchSpeed(whole);
    const entry = entrySpeed(whole);
    expect(launch.state).toBe("measured");
    expect(entry.state).toBe("measured");
    // Each is the stretch's own speed: the middle of the stretch, near enough.
    expect(launch.value!).toBeCloseTo(speedAt(v0, decel, 8) * MPH, 1);
    expect(entry.value!).toBeCloseTo(speedAt(v0, decel, 52.5) * MPH, 1);
    // A ball that slows enters slower than it was launched.
    expect(entry.value!).toBeLessThan(launch.value! - 1);
  });

  it("reads from each frame's own time, however unevenly the frames came", () => {
    // Every other frame lost here and there: the speeds do not move.
    const uneven = whole.filter((_, i) => i % 7 !== 3 && i % 11 !== 5);
    expect(Math.abs(launchSpeed(uneven).value! - launchSpeed(whole).value!)).toBeLessThan(0.15);
    expect(Math.abs(entrySpeed(uneven).value! - entrySpeed(whole).value!)).toBeLessThan(0.15);
  });

  it("leaves out the sightings after the rack moves", () => {
    // Past the head pin the ball is slowed by the pins: taken as seen, it would read low.
    const hit = whole.find((p) => p.v >= 60)!.t;
    const after = whole.map((p) => (p.t >= hit ? { ...p, v: 60 + (p.v - 60) * 0.3 } : p));
    expect(entrySpeed(after, hit).value!).toBeCloseTo(entrySpeed(whole).value!, 1);
    expect(entrySpeed(after).value!).toBeLessThan(entrySpeed(whole).value! - 0.2);
  });

  it("is missing where the ball was not seen, never filled in", () => {
    // Lost at 52 ft (the bowler in front of the pins): no entry speed.
    const short = whole.filter((p) => p.v <= 52);
    expect(entrySpeed(short)).toEqual({ value: null, state: "missing" });
    // Hidden over the near lane until 20 ft: no launch speed.
    const late = whole.filter((p) => p.v >= 20);
    expect(launchSpeed(late)).toEqual({ value: null, state: "missing" });
    expect(launchSpeed([])).toEqual({ value: null, state: "missing" });
    expect(entrySpeed([])).toEqual({ value: null, state: "missing" });
  });

  it("is estimated over a short stretch", () => {
    // Seen from 9 ft only: 6 ft of the launch stretch.
    const launch = launchSpeed(whole.filter((p) => p.v >= 9));
    expect(launch.state).toBe("estimated");
    expect(launch.value!).toBeCloseTo(speedAt(v0, decel, 12) * MPH, 0);
    // Last seen at 55 ft: estimated, over 10 ft.
    const entry = entrySpeed(whole.filter((p) => p.v <= 55));
    expect(entry.state).toBe("estimated");
  });

  it("is missing when the speed is not a bowling speed", () => {
    // 40 mph: a misread, not a ball.
    const fast = slowing(40 / MPH, 0, 0, 62);
    expect(launchSpeed(fast).state).toBe("missing");
    expect(entrySpeed(fast).state).toBe("missing");
  });
});
