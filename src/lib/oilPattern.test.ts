import { describe, expect, it } from "vitest";
import type { OilPass } from "../types/bowling";
import {
  oilBands, oilExitPoint, oilStats, oilZones, oiledSpanAt, peakUnits, toHandBoard,
} from "./oilPattern";

const pass = (p: Partial<OilPass> = {}): OilPass => ({
  direction: "forward",
  start_distance: 0,
  stop_distance: 35,
  left_board: 10,
  right_board: 30,
  loads: 2,
  microliters: 40,
  ...p,
});

describe("oilZones", () => {
  it("has no zones without passes", () => {
    expect(oilZones(undefined)).toEqual([]);
    expect(oilZones([])).toEqual([]);
  });

  it("totals one pass onto its boards and nowhere else", () => {
    const [zone] = oilZones([pass()]);
    expect(zone.start).toBe(0);
    expect(zone.stop).toBe(35);
    expect(zone.units[9]).toBe(80);  // board 10
    expect(zone.units[29]).toBe(80); // board 30
    expect(zone.units[8]).toBe(0);   // board 9, outside the pass
    expect(zone.units[30]).toBe(0);  // board 31
  });

  it("slices at every pass boundary and adds overlapping loads", () => {
    const zones = oilZones([
      pass({ start_distance: 0, stop_distance: 40, left_board: 5, right_board: 35, loads: 1, microliters: 30 }),
      pass({ start_distance: 0, stop_distance: 20, left_board: 15, right_board: 25, loads: 1, microliters: 30 }),
    ]);
    expect(zones.map((z) => [z.start, z.stop])).toEqual([[0, 20], [20, 40]]);
    expect(zones[0].units[19]).toBe(60); // board 20, both passes
    expect(zones[0].units[5]).toBe(30);  // board 6, the wide pass only
    expect(zones[1].units[19]).toBe(30); // past the short pass
  });

  it("drops a pass that cannot be drawn", () => {
    expect(oilZones([pass({ stop_distance: 0 })])).toEqual([]);
    expect(oilZones([pass({ loads: 0 })])).toEqual([]);
    expect(oilZones([pass({ left_board: 30, right_board: 10 })])).toEqual([]);
  });
});

describe("oilBands", () => {
  it("merges equally loaded neighbours into one rectangle", () => {
    const bands = oilBands(oilZones([pass()]));
    expect(bands).toEqual([{ start: 0, stop: 35, fromBoard: 10, toBoard: 30, units: 80 }]);
  });

  it("splits where the load steps, so the sheet's stairs survive", () => {
    const bands = oilBands(
      oilZones([
        pass({ left_board: 5, right_board: 35, loads: 1, microliters: 20 }),
        pass({ left_board: 15, right_board: 25, loads: 1, microliters: 20 }),
      ])
    );
    expect(bands.map((b) => [b.fromBoard, b.toBoard, b.units])).toEqual([
      [5, 14, 20],
      [15, 25, 40],
      [26, 35, 20],
    ]);
  });

  it("peaks at the heaviest board", () => {
    expect(peakUnits(oilZones([pass()]))).toBe(80);
    expect(peakUnits([])).toBe(0);
  });
});

describe("oilStats", () => {
  it("reads nothing off an empty table", () => {
    expect(oilStats([])).toMatchObject({ length: 0, volumeMl: 0, ratio: null });
  });

  it("takes the length from the deepest pass and the volume from the oil laid", () => {
    const stats = oilStats([
      pass({ stop_distance: 41, left_board: 1, right_board: 10, loads: 1, microliters: 100 }),
      pass({ direction: "reverse", stop_distance: 30, left_board: 1, right_board: 10, loads: 1, microliters: 50 }),
    ]);
    expect(stats.length).toBe(41);
    expect(stats.forwardMl).toBeCloseTo(1);   // 10 boards × 100 µL
    expect(stats.reverseMl).toBeCloseTo(0.5);
    expect(stats.volumeMl).toBeCloseTo(1.5);
    expect(stats.fromBoard).toBe(1);
    expect(stats.toBoard).toBe(10);
  });

  it("calls a flat pattern 1:1 and a stacked middle by its ratio", () => {
    expect(oilStats([pass({ left_board: 1, right_board: 39 })]).ratio).toBe(1);
    const house = oilStats([
      pass({ left_board: 5, right_board: 35, loads: 1, microliters: 10 }),
      pass({ left_board: 15, right_board: 25, loads: 7, microliters: 10 }),
    ]);
    expect(house.ratio).toBe(8); // 80 units in the middle against 10 outside
  });
});

describe("toHandBoard", () => {
  it("leaves a left-hander's boards alone and mirrors a right-hander's", () => {
    expect(toHandBoard(5, "left")).toBe(5);
    expect(toHandBoard(5, "right")).toBe(35);
    // The mirror is its own inverse, which is what lets the exit test compare
    // a path board against a sheet board with one call.
    expect(toHandBoard(toHandBoard(5, "right"), "right")).toBe(5);
  });
});

describe("oiledSpanAt", () => {
  const zones = oilZones([
    pass({ start_distance: 0, stop_distance: 40, left_board: 5, right_board: 35 }),
    pass({ start_distance: 0, stop_distance: 20, left_board: 1, right_board: 39 }),
  ]);

  it("gives the oiled width at a distance", () => {
    expect(oiledSpanAt(zones, 10)).toEqual({ fromBoard: 1, toBoard: 39 });
    expect(oiledSpanAt(zones, 30)).toEqual({ fromBoard: 5, toBoard: 35 });
  });

  it("is dry past the end of the pattern", () => {
    expect(oiledSpanAt(zones, 45)).toBeNull();
  });
});

describe("oilExitPoint", () => {
  // A 40 ft pattern, boards 5 to 35, both sides of the lane equally.
  const zones = oilZones([pass({ start_distance: 0, stop_distance: 40, left_board: 5, right_board: 35 })]);

  it("has no exit without a pattern", () => {
    expect(oilExitPoint([], [{ board: 20, feet: 0 }], "right")).toBeNull();
  });

  it("exits at the end of the pattern when the ball stays inside the oil", () => {
    const exit = oilExitPoint(zones, [{ board: 20, feet: 0 }, { board: 20, feet: 60 }], "right");
    expect(exit?.feet).toBeCloseTo(40, 1);
  });

  it("exits early, out at the edge, when the ball runs off the oiled width", () => {
    // A right-hander's board 5 is sheet board 35, the oil's right edge, so a
    // line drifting to board 2 leaves the pattern well before 40 ft.
    const exit = oilExitPoint(zones, [{ board: 20, feet: 0 }, { board: 1, feet: 40 }], "right");
    expect(exit!.feet).toBeLessThan(35);
    expect(exit!.board).toBeLessThan(6);
  });

  it("does not come back once the ball has left", () => {
    const exit = oilExitPoint(
      zones,
      [{ board: 20, feet: 0 }, { board: 1, feet: 20 }, { board: 20, feet: 30 }],
      "right"
    );
    expect(exit!.feet).toBeLessThan(20);
  });
});
