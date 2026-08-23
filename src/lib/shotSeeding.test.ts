import { describe, expect, it } from "vitest";
import { savedSpareLine, seedForShot, lineForBall, sessionSpareIntended } from "./shotSeeding";
import type { Ball, Frame, LineSpec, PinNumber, Shot, SpareLine } from "../types/bowling";

const LANE_12 = { lanes: ["12"], start_lane: "12", lane_number: "12" };
const PAIR = { lanes: ["11", "12"], start_lane: "11", lane_number: "11" };

const HAMMER: Ball = { id: 1, name: "Hammer", is_spare_ball: false, sort_order: 0 };
const SPARE_BALL: Ball = { id: 2, name: "Plastic", is_spare_ball: true, sort_order: 1 };

function frame(n: number, shots: Shot[], extra: Partial<Frame> = {}): Frame {
  return { game_id: 1, frame_number: n, shots, is_strike: false, is_spare: false, ...extra };
}

/** A struck frame: one shot, nothing standing, so it is a fresh-rack source. */
function strike(n: number, shot: Partial<Shot> = {}): Frame {
  return frame(n, [{ pins_standing: [] as PinNumber[], ...shot }], { is_strike: true });
}

const base = {
  currentShot: 1,
  currentFrameNumber: 2,
  availablePins: [] as PinNumber[],
  frames: [] as Frame[],
  currentFrameShots: [] as Shot[],
  balls: [HAMMER, SPARE_BALL],
  spareLines: [] as SpareLine[]
};

describe("seedForShot", () => {
  describe("first ball of a frame", () => {
    it("carries ball, line and notes from the previous frame on the same lane", () => {
      const seed = seedForShot({
        ...base,
        game: LANE_12,
        frames: [strike(1, { ball_id: 1, intended: { stance: 20, target: 15 }, notes: "flush" })]
      });

      expect(seed).toEqual({
        ballId: 1,
        intended: { stance: 20, target: 15 },
        notes: "flush"
      });
    });

    it("carries from the previous game on the same lane when this game has nothing", () => {
      const seed = seedForShot({
        ...base,
        currentFrameNumber: 1,
        game: LANE_12,
        previousGames: [
          { game: LANE_12, frames: [strike(9, { ball_id: 1, intended: { stance: 22 } })] }
        ]
      });

      expect(seed.ballId).toBe(1);
      expect(seed.intended).toEqual({ stance: 22 });
    });

    it("carries the LAST fresh-rack shot of a 10th frame, not its first", () => {
      // Strike, then strike: both balls are thrown at a full rack, and the one
      // that matters to the next game's frame 1 is the one thrown last.
      const tenth = frame(
        10,
        [
          { pins_standing: [] as PinNumber[], ball_id: 1, intended: { stance: 20 }, notes: "first" },
          { pins_standing: [] as PinNumber[], ball_id: 2, intended: { stance: 26 }, notes: "last" }
        ],
        { is_strike: true }
      );

      const seed = seedForShot({
        ...base,
        currentFrameNumber: 1,
        game: LANE_12,
        previousGames: [{ game: LANE_12, frames: [tenth] }]
      });

      expect(seed.ballId).toBe(2);
      expect(seed.intended).toEqual({ stance: 26 });
      expect(seed.notes).toBe("last");
    });

    it("ignores a 10th-frame spare attempt, which aims at a leave", () => {
      // 9 count, then the spare attempt. Only ball 1 is fresh-rack, so it
      // stays the seed (ADR-029) even though ball 2 was thrown later.
      const tenth = frame(10, [
        { pins_standing: [10] as PinNumber[], ball_id: 1, intended: { stance: 20 } },
        { pins_standing: [] as PinNumber[], ball_id: 2, intended: { stance: 34 } }
      ]);

      const seed = seedForShot({
        ...base,
        currentFrameNumber: 1,
        game: LANE_12,
        previousGames: [{ game: LANE_12, frames: [tenth] }]
      });

      expect(seed.ballId).toBe(1);
      expect(seed.intended).toEqual({ stance: 20 });
    });

    it("starts blank when there is nothing to carry", () => {
      expect(seedForShot({ ...base, game: LANE_12 })).toEqual({
        ballId: undefined,
        intended: undefined,
        notes: ""
      });
    });

    it("does not carry the notes of a shot that had none", () => {
      const seed = seedForShot({
        ...base,
        game: LANE_12,
        frames: [strike(1, { ball_id: 1, intended: { stance: 20 } })]
      });
      expect(seed.notes).toBe("");
    });
  });

  describe("spare attempt", () => {
    const leaveTen = {
      ...base,
      currentShot: 2,
      currentFrameNumber: 1,
      availablePins: [10] as PinNumber[],
      currentFrameShots: [{ pins_standing: [10] as PinNumber[], ball_id: 1 }]
    };

    it("picks the spare ball when one is configured", () => {
      expect(seedForShot({ ...leaveTen, game: LANE_12 }).ballId).toBe(2);
    });

    it("falls back to shot one's ball when there is no spare ball", () => {
      expect(seedForShot({ ...leaveTen, game: LANE_12, balls: [HAMMER] }).ballId).toBe(1);
    });

    it("prefills the saved line for that leave, two boards only", () => {
      const seed = seedForShot({
        ...leaveTen,
        game: LANE_12,
        spareLines: [
          {
            id: 1,
            pins: [10] as PinNumber[],
            // A saved line may carry more; only stance and target are its own.
            line: { stance: 30, target: 8, laydown: 19, breakpoint: 5 },
            sort_order: 0
          }
        ]
      });

      expect(seed.intended).toEqual({ stance: 30, target: 8 });
    });

    it("prefers this session's attempt at the same leave over the saved line", () => {
      const seed = seedForShot({
        ...leaveTen,
        game: LANE_12,
        sessionFrames: [
          frame(3, [
            { pins_standing: [10] as PinNumber[] },
            { pins_standing: [] as PinNumber[], intended: { stance: 34, target: 6 } }
          ], { is_spare: true })
        ],
        spareLines: [{ id: 1, pins: [10] as PinNumber[], line: { stance: 30, target: 8 }, sort_order: 0 }]
      });

      expect(seed.intended).toEqual({ stance: 34, target: 6 });
    });

    it("matches a leave whatever order its pins are listed in", () => {
      const seed = seedForShot({
        ...leaveTen,
        availablePins: [10, 7] as PinNumber[],
        currentFrameShots: [{ pins_standing: [7, 10] as PinNumber[], ball_id: 1 }],
        game: LANE_12,
        spareLines: [{ id: 1, pins: [10, 7] as PinNumber[], line: { stance: 25 }, sort_order: 0 }]
      });

      expect(seed.intended).toEqual({ stance: 25 });
    });

    it("leaves the line blank when nothing knows this leave", () => {
      const seed = seedForShot({ ...leaveTen, game: LANE_12 });
      expect(seed.intended).toBeUndefined();
      expect(seed.notes).toBe("");
    });
  });

  describe("fresh-rack bonus ball", () => {
    it("carries from the most recent fresh-rack shot of the frame (ADR-029)", () => {
      const seed = seedForShot({
        ...base,
        currentShot: 2,
        currentFrameNumber: 10,
        availablePins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as PinNumber[],
        currentFrameShots: [
          { pins_standing: [] as PinNumber[], ball_id: 1, intended: { stance: 21, target: 14 } }
        ],
        game: LANE_12
      });

      expect(seed.ballId).toBe(1);
      expect(seed.intended).toEqual({ stance: 21, target: 14 });
      expect(seed.notes).toBe("");
    });
  });

  describe("falling back to the ball's own history (ADR-035)", () => {
    it("uses the line this ball was last thrown on, flagged as a guess", () => {
      const seed = seedForShot({
        ...base,
        currentShot: 2,
        currentFrameNumber: 3,
        availablePins: [10] as PinNumber[],
        currentFrameShots: [{ pins_standing: [10] as PinNumber[], ball_id: 1 }],
        game: LANE_12,
        // No spare ball configured, so the shot keeps ball 1 and looks up what
        // ball 1 was last thrown on: an earlier frame, not this one.
        balls: [HAMMER],
        frames: [strike(1, { ball_id: 1, intended: { stance: 18, target: 12 } })]
      });

      expect(seed.intended).toEqual({ stance: 18, target: 12 });
    });

    it("prefers a real carry-forward over the ball's history", () => {
      const seed = seedForShot({
        ...base,
        game: LANE_12,
        frames: [strike(1, { ball_id: 1, intended: { stance: 20, target: 15 } })]
      });
      expect(seed.intended).toEqual({ stance: 20, target: 15 });
    });
  });

  it("does not carry a line across a change of lane", () => {
    const seed = seedForShot({
      ...base,
      currentFrameNumber: 1,
      game: { lanes: ["9"], start_lane: "9", lane_number: "9" },
      previousGames: [
        { game: LANE_12, frames: [strike(9, { ball_id: 1, intended: { stance: 22 } })] }
      ]
    });

    expect(seed.intended).toBeUndefined();
  });
});

describe("lineForBall", () => {
  it("finds the line for that ball, and says it is a guess", () => {
    const result = lineForBall(
      {
        currentFrameNumber: 3,
        frames: [strike(1, { ball_id: 1, intended: { stance: 19 } })],
        game: LANE_12
      },
      1,
      []
    );

    expect(result).toEqual({ stance: 19 });
  });

  it("says nothing when the ball has no history, or there is no ball", () => {
    const frames = [strike(1, { ball_id: 1, intended: { stance: 19 } })];
    expect(lineForBall({ currentFrameNumber: 3, frames, game: LANE_12 }, 2, [])).toBeUndefined();
    expect(
      lineForBall({ currentFrameNumber: 3, frames, game: LANE_12 }, undefined, [])
    ).toBeUndefined();
  });

  it("prefers the same lane of a pair over the other one", () => {
    const result = lineForBall(
      {
        currentFrameNumber: 3, // odd frame -> lane 11 on this pair
        game: PAIR,
        frames: [
          strike(1, { ball_id: 1, intended: { stance: 20 } }), // lane 11
          strike(2, { ball_id: 1, intended: { stance: 30 } }) // lane 12
        ]
      },
      1,
      []
    );

    expect(result).toEqual({ stance: 20 });
  });

  it("returns a copy, so editing the box cannot rewrite a recorded shot", () => {
    const recorded: LineSpec = { stance: 19 };
    const result = lineForBall(
      { currentFrameNumber: 3, frames: [strike(1, { ball_id: 1, intended: recorded })], game: LANE_12 },
      1,
      []
    );

    expect(result).not.toBe(recorded);
  });
});

describe("sessionSpareIntended", () => {
  const attempt = (n: number, leave: PinNumber[], intended?: LineSpec) =>
    frame(n, [{ pins_standing: leave }, { pins_standing: [] as PinNumber[], intended }]);

  it("finds the last attempt at the same leave", () => {
    const found = sessionSpareIntended(
      [attempt(2, [10], { stance: 30 }), attempt(5, [10], { stance: 33 })],
      [10]
    );
    expect(found).toEqual({ stance: 33 });
  });

  it("ignores a different leave, and an attempt with no line", () => {
    expect(sessionSpareIntended([attempt(2, [7], { stance: 30 })], [10])).toBeUndefined();
    expect(sessionSpareIntended([attempt(2, [10])], [10])).toBeUndefined();
  });

  it("skips the 10th frame, where a second shot may be a fresh rack", () => {
    expect(sessionSpareIntended([attempt(10, [10], { stance: 30 })], [10])).toBeUndefined();
  });

  it("ignores a frame that never got a second shot", () => {
    expect(sessionSpareIntended([frame(2, [{ pins_standing: [10] }])], [10])).toBeUndefined();
  });
});

describe("savedSpareLine", () => {
  const lines: SpareLine[] = [
    { id: 1, pins: [10] as PinNumber[], line: { stance: 30 }, sort_order: 0 },
    { id: 2, pins: [3, 10] as PinNumber[], line: { stance: 25 }, sort_order: 1 }
  ];

  it("matches on the set of pins, not their order", () => {
    expect(savedSpareLine(lines, [10, 3] as PinNumber[])?.id).toBe(2);
  });

  it("does not match a subset", () => {
    expect(savedSpareLine(lines, [3] as PinNumber[])).toBeUndefined();
  });
});

describe("a strike ball at a leave (ADR-053)", () => {
  const TEN_PIN = [10] as PinNumber[];
  /** The Hammer struck frame 1 playing 20 at the feet, 15 at the arrows. */
  const hammerStruck = [strike(1, { ball_id: 1, intended: { stance: 20, target: 15 } })];
  const withOffset = (offset: { stance?: number; target?: number }): SpareLine[] => [
    { id: 1, pins: TEN_PIN, line: { stance: 30, target: 8 }, strike_offset: offset, sort_order: 0 }
  ];

  it("moves the ball's own strike line by the leave's offset", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 3,
        frames: hammerStruck,
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 4, target: -3 })
      },
      1,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 24, target: 12 });
  });

  it("moves only the boards the offset names, so a feet-only move leaves the arrows alone", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 3,
        frames: hammerStruck,
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 5 })
      },
      1,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 25 });
  });

  it("does not move a spare ball: the offset is a strike-ball concept", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 3,
        frames: hammerStruck,
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 4 })
      },
      2,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 30, target: 8 });
  });

  it("falls back to the absolute line when the strike ball has no strike line to move", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 3,
        frames: [],
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 4 })
      },
      1,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 30, target: 8 });
  });

  it("prefers this ball's own attempt at the leave over the offset", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 5,
        frames: [
          ...hammerStruck,
          frame(3, [
            { pins_standing: TEN_PIN },
            { pins_standing: [], ball_id: 1, intended: { stance: 27, target: 11 } }
          ], { is_spare: true })
        ],
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 4, target: -3 })
      },
      1,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 27, target: 11 });
  });

  it("ignores an attempt at that leave thrown with a different ball", () => {
    const line = lineForBall(
      {
        currentFrameNumber: 5,
        frames: [
          ...hammerStruck,
          frame(3, [
            { pins_standing: TEN_PIN },
            { pins_standing: [], ball_id: 2, intended: { stance: 31, target: 7 } }
          ], { is_spare: true })
        ],
        game: LANE_12,
        balls: [HAMMER, SPARE_BALL],
        spareLines: withOffset({ stance: 4, target: -3 })
      },
      1,
      [],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 24, target: 12 });
  });
});
