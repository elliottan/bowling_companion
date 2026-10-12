import { describe, expect, it } from "vitest";
import {
  earlierSessionFrames,
  savedSpareLine,
  seedForShot,
  lineForBall,
  sessionSpareIntended
} from "./shotSeeding";
import type { Ball, Frame, LineSpec, PinNumber, SessionSummary, Shot, SpareLine } from "../types/bowling";

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

  it("carries the ball across a change of lane, with its line as a starting point", () => {
    // ADR-113: the ball is the last one thrown, on any lane. Its line comes
    // from the lane in play first, and from another lane only when this one
    // has none, which is the same fallback ADR-035 gave an empty box.
    const seed = seedForShot({
      ...base,
      currentFrameNumber: 1,
      game: { lanes: ["9"], start_lane: "9", lane_number: "9" },
      previousGames: [
        { game: LANE_12, frames: [strike(9, { ball_id: 1, intended: { stance: 22 } })] }
      ]
    });

    expect(seed.ballId).toBe(1);
    expect(seed.intended).toEqual({ stance: 22 });
  });

  it("does not carry an untagged line across a change of lane", () => {
    const seed = seedForShot({
      ...base,
      currentFrameNumber: 1,
      game: { lanes: ["9"], start_lane: "9", lane_number: "9" },
      previousGames: [{ game: LANE_12, frames: [strike(9, { intended: { stance: 22 } })] }]
    });

    expect(seed.ballId).toBeUndefined();
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

  it("reads the 10th frame's own spare attempt", () => {
    expect(sessionSpareIntended([attempt(10, [10], { stance: 30 })], [10])).toEqual({ stance: 30 });
  });

  it("reads a 10th-frame attempt at a leave the bonus ball made", () => {
    // Strike, then 9 leaving the 10-pin, then the ball at it: the 12th shot is
    // the spare attempt, and shots[0] is not its leave.
    const tenth = frame(10, [
      { pins_standing: [] as PinNumber[] },
      { pins_standing: [10] as PinNumber[] },
      { pins_standing: [] as PinNumber[], intended: { stance: 31 } }
    ]);
    expect(sessionSpareIntended([tenth], [10])).toEqual({ stance: 31 });
  });

  it("does not read a 10th-frame bonus ball as an attempt at nothing", () => {
    const tenth = frame(10, [
      { pins_standing: [] as PinNumber[] },
      { pins_standing: [] as PinNumber[], intended: { stance: 22 } }
    ]);
    expect(sessionSpareIntended([tenth], [])).toBeUndefined();
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

  it("never hands a strike ball the spare ball's absolute line (ADR-113)", () => {
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
    expect(line).toBeUndefined();
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

describe("ADR-113: the ball follows the last throw, the line follows the ball", () => {
  const GEM: Ball = { id: 3, name: "Gem", is_spare_ball: false, sort_order: 2 };
  const balls = [HAMMER, SPARE_BALL, GEM];

  it("seeds the ball changed to in the frame between, not the same-lane frame's", () => {
    // Lane pair: frame 3 is on 11 like frame 1, but the bowler changed to the
    // Gem in frame 2 on lane 12. Frame 3 opens with the Gem, on the Gem's line.
    const seed = seedForShot({
      ...base,
      balls,
      currentFrameNumber: 3,
      game: PAIR,
      frames: [
        strike(1, { ball_id: 1, intended: { stance: 20, target: 15 } }),
        strike(2, { ball_id: 3, intended: { stance: 24, target: 17 } })
      ]
    });
    expect(seed.ballId).toBe(3);
    expect(seed.intended).toEqual({ stance: 24, target: 17 });
  });

  it("prefers the new ball's line on this lane once it has one", () => {
    const seed = seedForShot({
      ...base,
      balls,
      currentFrameNumber: 5,
      game: PAIR,
      frames: [
        strike(1, { ball_id: 3, intended: { stance: 22, target: 16 } }),
        strike(2, { ball_id: 1, intended: { stance: 20, target: 15 } }),
        strike(3, { ball_id: 1, intended: { stance: 21, target: 15 } }),
        strike(4, { ball_id: 3, intended: { stance: 24, target: 17 } })
      ]
    });
    expect(seed.ballId).toBe(3);
    expect(seed.intended).toEqual({ stance: 22, target: 16 });
  });

  it("seeds game 1 frame 2 on a pair from frame 1", () => {
    const seed = seedForShot({
      ...base,
      balls,
      currentFrameNumber: 2,
      game: PAIR,
      frames: [strike(1, { ball_id: 1, intended: { stance: 20, target: 15 } })]
    });
    expect(seed.ballId).toBe(1);
    expect(seed.intended).toEqual({ stance: 20, target: 15 });
  });

  it("skips spare attempts when looking for the last ball", () => {
    const seed = seedForShot({
      ...base,
      balls,
      currentFrameNumber: 2,
      game: LANE_12,
      frames: [
        frame(1, [
          { pins_standing: [10] as PinNumber[], ball_id: 1 },
          { pins_standing: [] as PinNumber[], ball_id: 2 }
        ])
      ]
    });
    expect(seed.ballId).toBe(1);
  });

  it("still takes notes from the same-lane frame", () => {
    const seed = seedForShot({
      ...base,
      balls,
      currentFrameNumber: 3,
      game: PAIR,
      frames: [strike(1, { ball_id: 1, notes: "left lane hooks" }), strike(2, { ball_id: 3 })]
    });
    expect(seed.notes).toBe("left lane hooks");
  });

  it("never hands back the stored object as the seed", () => {
    const stored: LineSpec = { stance: 20, target: 15 };
    const seed = seedForShot({
      ...base,
      currentFrameNumber: 2,
      game: LANE_12,
      frames: [strike(1, { intended: stored })]
    });
    expect(seed.intended).toEqual(stored);
    expect(seed.intended).not.toBe(stored);
  });

  describe("at a leave", () => {
    const TEN_PIN = [10] as PinNumber[];
    const saved: SpareLine[] = [{ id: 1, pins: TEN_PIN, line: { stance: 31, target: 22 }, sort_order: 0 }];

    it("gives a strike ball its own strike line, not the leave's saved line", () => {
      const line = lineForBall(
        {
          currentFrameNumber: 3,
          frames: [strike(1, { ball_id: 3, intended: { stance: 20, target: 15 } })],
          game: LANE_12,
          balls,
          spareLines: saved
        },
        3,
        [],
        TEN_PIN
      );
      expect(line).toEqual({ stance: 20, target: 15 });
    });

    it("still gives the spare ball the saved line", () => {
      const line = lineForBall(
        { currentFrameNumber: 3, frames: [], game: LANE_12, balls, spareLines: saved },
        2,
        [],
        TEN_PIN
      );
      expect(line).toEqual({ stance: 31, target: 22 });
    });

    it("does not give a strike ball an untagged attempt at the leave", () => {
      const line = lineForBall(
        {
          currentFrameNumber: 3,
          frames: [
            frame(1, [
              { pins_standing: TEN_PIN },
              { pins_standing: [] as PinNumber[], intended: { stance: 33, target: 20 } }
            ])
          ],
          game: LANE_12,
          balls,
          spareLines: []
        },
        3,
        [],
        TEN_PIN
      );
      expect(line).toBeUndefined();
    });
  });
});

describe("ADR-125: a spare ball with nothing saved starts from the strike ball's line", () => {
  const TEN_PIN = [10] as PinNumber[];
  const SECOND_STRIKE_BALL: Ball = { id: 3, name: "Phaze", is_spare_ball: false, sort_order: 2 };
  const balls = [HAMMER, SPARE_BALL, SECOND_STRIKE_BALL];
  /** Frame 3: the Hammer was thrown at the rack on 20 at the feet, 15 at the
   *  arrows, and left the 10. */
  const rackShot: Shot = { pins_standing: TEN_PIN, ball_id: 1, intended: { stance: 20, target: 15 } };
  const spareLine = (extra: Partial<SpareLine>): SpareLine[] => [
    { id: 1, pins: TEN_PIN, sort_order: 0, ...extra }
  ];
  const at = (spareLines: SpareLine[], extra: object = {}) => ({
    currentFrameNumber: 3,
    frames: [] as Frame[],
    game: LANE_12,
    balls,
    spareLines,
    ...extra
  });

  it("gives the spare ball nothing at a leave saved with only a strike move (ADR-132)", () => {
    const line = lineForBall(
      at(spareLine({ strike_offset: { stance: 4, target: -3 } })),
      2,
      [rackShot],
      TEN_PIN
    );
    expect(line).toBeUndefined();
  });

  it("still gives the spare ball its own attempt at a move-only leave (ADR-132)", () => {
    const earlier = [
      frame(1, [
        { pins_standing: TEN_PIN, ball_id: 1 },
        { pins_standing: [] as PinNumber[], ball_id: 2, intended: { stance: 33, target: 7 } }
      ])
    ];
    const line = lineForBall(
      at(spareLine({ strike_offset: { stance: 4 } }), { frames: earlier }),
      2,
      [rackShot],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 33, target: 7 });
  });

  it("takes the strike ball's line as it is when the leave has no move", () => {
    expect(lineForBall(at([]), 2, [rackShot], TEN_PIN)).toEqual({ stance: 20, target: 15 });
  });

  it("takes the strike ball thrown at this rack, not one thrown earlier", () => {
    const earlier = [strike(1, { ball_id: 3, intended: { stance: 12, target: 9 } })];
    const line = lineForBall(at([], { frames: earlier }), 2, [rackShot], TEN_PIN);
    expect(line).toEqual({ stance: 20, target: 15 });
  });

  it("prefers the leave's saved spare line when there is one", () => {
    const line = lineForBall(
      at(spareLine({ line: { stance: 30, target: 8 }, strike_offset: { stance: 4 } })),
      2,
      [rackShot],
      TEN_PIN
    );
    expect(line).toEqual({ stance: 30, target: 8 });
  });

  it("prefers the spare ball's own attempt at the leave this session", () => {
    const earlier = [
      frame(1, [
        { pins_standing: TEN_PIN, ball_id: 1 },
        { pins_standing: [] as PinNumber[], ball_id: 2, intended: { stance: 33, target: 7 } }
      ])
    ];
    const line = lineForBall(at([], { frames: earlier }), 2, [rackShot], TEN_PIN);
    expect(line).toEqual({ stance: 33, target: 7 });
  });

  it("does not move a rack ball that is itself a spare ball: its own line, as before", () => {
    const sparedFirst: Shot = { pins_standing: TEN_PIN, ball_id: 2, intended: { stance: 18, target: 11 } };
    const line = lineForBall(at([]), 2, [sparedFirst], TEN_PIN);
    expect(line).toEqual({ stance: 18, target: 11 });
  });

  it("says nothing when no ball was thrown at the rack and nothing is saved", () => {
    expect(lineForBall(at([]), 2, [{ pins_standing: TEN_PIN }], TEN_PIN)).toBeUndefined();
  });

  it("returns a copy, so editing the box cannot rewrite the rack shot", () => {
    const line = lineForBall(at([]), 2, [rackShot], TEN_PIN);
    expect(line).not.toBe(rackShot.intended);
  });

  const spareAttempt = (spareLines: SpareLine[], currentFrameShots: Shot[] = [rackShot]) =>
    seedForShot({
      ...base,
      currentShot: 2,
      currentFrameNumber: 3,
      availablePins: TEN_PIN,
      currentFrameShots,
      game: LANE_12,
      balls,
      spareLines
    });

  it("opens the spare attempt on the spare ball when the leave has no answer saved", () => {
    const seed = spareAttempt([]);
    expect(seed.ballId).toBe(2);
    expect(seed.intended).toEqual({ stance: 20, target: 15 });
  });

  describe("ADR-132: a leave answered only by a strike ball move", () => {
    it("opens on the strike ball thrown at the rack, on its line moved", () => {
      const seed = spareAttempt(spareLine({ strike_offset: { stance: 4, target: -3 } }));
      expect(seed.ballId).toBe(1);
      expect(seed.intended).toEqual({ stance: 24, target: 12 });
    });

    it("keeps the spare ball when the leave has a spare line as well", () => {
      const seed = spareAttempt(
        spareLine({ line: { stance: 30, target: 8 }, strike_offset: { stance: 4, target: -3 } })
      );
      expect(seed.ballId).toBe(2);
      expect(seed.intended).toEqual({ stance: 30, target: 8 });
    });

    it("keeps the spare ball when the rack was thrown with the spare ball", () => {
      const sparedFirst: Shot = { pins_standing: TEN_PIN, ball_id: 2, intended: { stance: 18, target: 11 } };
      const seed = spareAttempt(spareLine({ strike_offset: { stance: 4 } }), [sparedFirst]);
      expect(seed.ballId).toBe(2);
    });

    it("keeps the spare ball when no ball is on record for the rack", () => {
      const seed = spareAttempt(spareLine({ strike_offset: { stance: 4 } }), [{ pins_standing: TEN_PIN }]);
      expect(seed.ballId).toBe(2);
    });

    it("ignores a move of zero boards, which is no move", () => {
      const seed = spareAttempt(spareLine({ strike_offset: { stance: 0 } }));
      expect(seed.ballId).toBe(2);
    });
  });

  describe("swapping balls at the leave", () => {
    const saved = spareLine({
      line: { stance: 30, target: 8 },
      strike_offset: { stance: 4, target: -3 }
    });

    it("shows the strike move for a strike ball and the spare line for the spare ball, both ways", () => {
      const input = at(saved);
      const spare = lineForBall(input, 2, [rackShot], TEN_PIN);
      const strikeBall = lineForBall(input, 1, [rackShot], TEN_PIN);
      expect(spare).toEqual({ stance: 30, target: 8 });
      expect(strikeBall).toEqual({ stance: 24, target: 12 });
      // And back again: the same answer, not a leftover of the other ball.
      expect(lineForBall(input, 2, [rackShot], TEN_PIN)).toEqual(spare);
    });

    it("moves the line the rack ball threw for a different strike ball with no line of its own", () => {
      // The Phaze has never been thrown at a rack, so it has nothing to move.
      expect(lineForBall(at(saved), 3, [rackShot], TEN_PIN)).toBeUndefined();
    });

    it("never shows the strike move on the spare ball while the leave has no spare line (ADR-132)", () => {
      const moveOnly = spareLine({ strike_offset: { stance: 4, target: -3 } });
      const input = at(moveOnly);
      expect(lineForBall(input, 1, [rackShot], TEN_PIN)).toEqual({ stance: 24, target: 12 });
      expect(lineForBall(input, 2, [rackShot], TEN_PIN)).toBeUndefined();
      expect(lineForBall(input, 1, [rackShot], TEN_PIN)).toEqual({ stance: 24, target: 12 });
    });
  });
});

describe("a strike ball swapped at a full rack takes its own last line", () => {
  const SECOND_STRIKE_BALL: Ball = { id: 3, name: "Phaze", is_spare_ball: false, sort_order: 2 };
  const balls = [HAMMER, SPARE_BALL, SECOND_STRIKE_BALL];
  const frames = [
    strike(1, { ball_id: 1, intended: { stance: 20, target: 15 } }),
    strike(2, { ball_id: 3, intended: { stance: 26, target: 11 } })
  ];
  const input = { currentFrameNumber: 3, frames, game: LANE_12, balls, spareLines: [] as SpareLine[] };

  it("goes to each ball's own line as you swap", () => {
    expect(lineForBall(input, 1, [])).toEqual({ stance: 20, target: 15 });
    expect(lineForBall(input, 3, [])).toEqual({ stance: 26, target: 11 });
    expect(lineForBall(input, 1, [])).toEqual({ stance: 20, target: 15 });
  });
});

describe("ADR-123: a pocket leave is shot like a strike", () => {
  const POCKET: PinNumber[] = [1, 2, 3, 5];
  const ballOne: Shot = { pins_standing: POCKET, ball_id: 1, intended: { stance: 20, target: 12 } };
  const savedForPocket: SpareLine[] = [
    { pins: POCKET, line: { stance: 30, target: 20 }, sort_order: 0 }
  ];

  it("opens with the strike ball and the line just thrown, not the spare ball", () => {
    const seed = seedForShot({
      ...base,
      currentShot: 2,
      game: LANE_12,
      availablePins: POCKET,
      currentFrameShots: [ballOne],
      spareLines: savedForPocket
    });

    expect(seed).toEqual({ ballId: 1, intended: { stance: 20, target: 12 }, notes: "" });
  });

  it("counts any leave with the 1 and the 5 standing, for either hand", () => {
    for (const leave of [[1, 5], [1, 3, 5], [1, 2, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5, 6, 8, 9, 10]] as PinNumber[][]) {
      const seed = seedForShot({
        ...base,
        currentShot: 2,
        game: LANE_12,
        availablePins: leave,
        currentFrameShots: [{ ...ballOne, pins_standing: leave }]
      });
      expect(seed.ballId).toBe(1);
      expect(seed.intended).toEqual({ stance: 20, target: 12 });
    }
  });

  it("leaves a leave without the 5 a spare attempt", () => {
    const leave: PinNumber[] = [1, 3, 6, 10];
    const seed = seedForShot({
      ...base,
      currentShot: 2,
      game: LANE_12,
      availablePins: leave,
      currentFrameShots: [{ ...ballOne, pins_standing: leave }]
    });
    expect(seed.ballId).toBe(SPARE_BALL.id);
  });

  it("ignores a spare line saved for the leave on a ball change", () => {
    const line = lineForBall(
      { currentFrameNumber: 2, frames: [], game: LANE_12, spareLines: savedForPocket, balls: base.balls },
      SPARE_BALL.id,
      [ballOne],
      POCKET
    );
    expect(line).toBeUndefined();
  });
});

describe("ADR-140: a spare line follows its row, and the house's last session", () => {
  /** The 6 and the 6-10 saved on one line, the 10 on another. */
  const SAVED: SpareLine[] = [
    { id: 1, pins: [6] as PinNumber[], line: { stance: 34, target: 29 }, sort_order: 0 },
    { id: 2, pins: [6, 10] as PinNumber[], line: { stance: 34, target: 29 }, sort_order: 1 },
    { id: 3, pins: [10] as PinNumber[], line: { stance: 30, target: 20 }, sort_order: 2 }
  ];

  /** A spare attempt at `leave` with the spare ball, on `intended`. */
  function attempt(n: number, leave: PinNumber[], intended: LineSpec): Frame {
    return frame(
      n,
      [
        { pins_standing: leave, ball_id: 1 },
        { pins_standing: [] as PinNumber[], ball_id: 2, intended }
      ],
      { is_spare: true }
    );
  }

  /** Shot two at `leave`, frame 5 of this game. */
  const at = (leave: PinNumber[]) => ({
    ...base,
    spareLines: SAVED,
    game: LANE_12,
    currentShot: 2,
    currentFrameNumber: 5,
    availablePins: leave,
    currentFrameShots: [{ pins_standing: leave, ball_id: 1 }]
  });

  it("opens the 6-10 on the move made at the 6 this session, the two being saved on one line", () => {
    const seed = seedForShot({ ...at([6, 10]), frames: [attempt(2, [6], { stance: 36, target: 30 })] });
    expect(seed.intended).toEqual({ stance: 36, target: 30 });
  });

  it("takes the newest attempt on the line, whichever leave it was at", () => {
    const seed = seedForShot({
      ...at([6]),
      sessionFrames: [attempt(3, [6], { stance: 35, target: 29 })],
      frames: [attempt(2, [6, 10], { stance: 37, target: 31 })]
    });
    expect(seed.intended).toEqual({ stance: 37, target: 31 });
  });

  it("does not carry a move to a leave saved on a different line", () => {
    const seed = seedForShot({ ...at([10]), frames: [attempt(2, [6], { stance: 36, target: 30 })] });
    expect(seed.intended).toEqual({ stance: 30, target: 20 });
  });

  it("keeps a leave with no saved line to its own attempts", () => {
    const seed = seedForShot({
      ...at([7]),
      frames: [attempt(2, [6], { stance: 36, target: 30 })]
    });
    expect(seed.intended).toBeUndefined();
  });

  it("falls back to the last session at this house on this pattern before the saved line", () => {
    const seed = seedForShot({
      ...at([6, 10]),
      earlierSessionFrames: [
        attempt(4, [6, 10], { stance: 33, target: 28 }),
        attempt(7, [6], { stance: 35, target: 30 })
      ]
    });
    expect(seed.intended).toEqual({ stance: 35, target: 30 });
  });

  it("lets this session's attempt win over an earlier session's", () => {
    const seed = seedForShot({
      ...at([6]),
      earlierSessionFrames: [attempt(4, [6], { stance: 33, target: 28 })],
      sessionFrames: [attempt(1, [6, 10], { stance: 36, target: 29 })]
    });
    expect(seed.intended).toEqual({ stance: 36, target: 29 });
  });

  it("gives a strike ball only its own attempts at the exact leave, earlier sessions included", () => {
    const strikeAttempt = (n: number, leave: PinNumber[], intended: LineSpec) =>
      frame(n, [
        { pins_standing: leave, ball_id: 1 },
        { pins_standing: [] as PinNumber[], ball_id: 1, intended }
      ]);
    const input = {
      ...at([6, 10]),
      frames: [strikeAttempt(2, [6], { stance: 20, target: 12 })],
      earlierSessionFrames: [strikeAttempt(6, [6, 10], { stance: 19, target: 11 })]
    };
    expect(lineForBall(input, 1, input.currentFrameShots, [6, 10])).toEqual({ stance: 19, target: 11 });
  });
});

describe("earlierSessionFrames (ADR-140)", () => {
  const night = (
    id: number,
    date: string,
    alley: string,
    pattern: number | undefined,
    tag: number
  ): SessionSummary => ({
    session: { id, date, alley_name: alley, oil_pattern_id: pattern },
    games: [
      {
        id: id * 10,
        session_id: id,
        game_number: 1,
        frames: [frame(tag, [{ pins_standing: [] as PinNumber[] }])]
      } as SessionSummary["games"][number]
    ]
  });
  const tags = (frames: Frame[]) => frames.map((f) => f.frame_number);
  const now = { id: 9, date: "2026-10-12", alley_name: "Sea Bowl", oil_pattern_id: 4 };

  it("keeps earlier nights at this house on this pattern, oldest first", () => {
    const history = [
      night(3, "2026-09-20", "Sea Bowl", 4, 3),
      night(1, "2026-08-01", "sea bowl ", 4, 1),
      night(2, "2026-09-01", "Sea Bowl", 5, 2), // another pattern
      night(4, "2026-09-25", "Jurong", 4, 4), // another house
      night(9, "2026-10-12", "Sea Bowl", 4, 9), // this night
      night(5, "2026-11-01", "Sea Bowl", 4, 5) // after it
    ];
    expect(tags(earlierSessionFrames(history, now))).toEqual([1, 3]);
  });

  it("matches a night with no pattern only to others with none", () => {
    const history = [night(1, "2026-08-01", "Sea Bowl", undefined, 1), night(2, "2026-08-02", "Sea Bowl", 4, 2)];
    expect(tags(earlierSessionFrames(history, { ...now, oil_pattern_id: undefined }))).toEqual([1]);
  });

  it("finds nothing without an alley to match", () => {
    const history = [night(1, "2026-08-01", "", 4, 1)];
    expect(earlierSessionFrames(history, { ...now, alley_name: " " })).toEqual([]);
  });
});
