import { describe, expect, it } from "vitest";
import {
  calculateBallPerformance,
  calculateCommonLeaves,
  calculateStats,
  filterSessionsBy
} from "./stats";
import type { Ball, Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

const NONE: PinNumber[] = [];

function frame(
  n: number,
  s1: PinNumber[],
  s2?: PinNumber[],
  s3?: PinNumber[]
): Frame {
  const shots: Shot[] = [{ pins_standing: s1 }];
  if (s2 !== undefined) shots.push({ pins_standing: s2 });
  if (s3 !== undefined) shots.push({ pins_standing: s3 });
  return {
    game_id: 1,
    frame_number: n,
    shots,
    is_strike: s1.length === 0,
    is_spare: s1.length > 0 && s2?.length === 0
  };
}

function game(finalScore: number | undefined, frames: Frame[]): Game & { frames: Frame[] } {
  return { id: 1, session_id: 1, game_number: 1, final_score: finalScore, frames };
}

function session(alley: string, games: Array<Game & { frames: Frame[] }>): SessionSummary {
  return { session: { date: "2026-06-07", alley_name: alley }, games };
}

describe("calculateStats", () => {
  it("returns null metrics for no data", () => {
    const stats = calculateStats([]);
    expect(stats).toEqual({
      totalSessions: 0,
      totalGames: 0,
      completedGames: 0,
      averageScore: null,
      highGame: null,
      lowGame: null,
      strikePct: null,
      sparePct: null,
      pocketPct: null,
      carryPct: null,
      byAlley: []
    });
  });

  it("scores a perfect game as 100% strikes", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      frame(10, NONE, NONE, NONE)
    ];
    const stats = calculateStats([session("Perfect Lanes", [game(300, frames)])]);

    expect(stats.completedGames).toBe(1);
    expect(stats.averageScore).toBe(300);
    expect(stats.highGame).toBe(300);
    expect(stats.strikePct).toBe(100);
    expect(stats.sparePct).toBeNull(); // no spare opportunities
  });

  it("counts spare opportunities and conversions", () => {
    // 9 open frames (no strike, no spare), 10th open.
    const frames = [
      frame(1, [10], NONE), // spare made (9 then clear)
      frame(2, [10], [10]), // spare opportunity missed
      ...Array.from({ length: 7 }, (_, i) => frame(i + 3, [10], [10])),
      frame(10, [10], [10])
    ];
    const stats = calculateStats([session("Spare Lanes", [game(90, frames)])]);

    // Frames 1-9: 9 first-ball opps, 0 strikes. 10th ball1 opp, 0 strikes.
    expect(stats.strikePct).toBe(0);
    // Spare opps: frames 1-9 each have a 2nd ball (9) + 10th (1) = 10.
    // Made: only frame 1. 1/10 = 10%.
    expect(stats.sparePct).toBe(10);
  });

  it("averages only completed games and groups by alley", () => {
    const open = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], [10])),
      frame(10, [10], [10])
    ];
    const sessions: SessionSummary[] = [
      session("Alley A", [game(150, open), game(undefined, open)]),
      session("Alley B", [game(120, open)])
    ];
    const stats = calculateStats(sessions);

    expect(stats.totalGames).toBe(3);
    expect(stats.completedGames).toBe(2);
    expect(stats.averageScore).toBe(135); // (150 + 120) / 2
    expect(stats.highGame).toBe(150);
    expect(stats.byAlley).toEqual([
      { alley: "Alley A", games: 1, average: 150, high: 150 },
      { alley: "Alley B", games: 1, average: 120, high: 120 }
    ]);
  });
});

describe("calculateCommonLeaves", () => {
  it("returns empty array for no sessions", () => {
    expect(calculateCommonLeaves([])).toEqual([]);
  });

  it("counts leaves and conversions correctly", () => {
    // Frame leaving the 10-pin, converted
    const f1 = frame(1, [10 as PinNumber], NONE);
    // Frame leaving the 10-pin, not converted
    const f2 = frame(2, [10 as PinNumber], [10 as PinNumber]);
    // Frame leaving pins 7 and 10
    const f3 = frame(3, [7 as PinNumber, 10 as PinNumber], NONE);
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, [f1, f2, f3])])
    ];
    const result = calculateCommonLeaves(sessions);

    // 10-pin leave appears twice — most frequent
    expect(result[0].pins).toEqual([10]);
    expect(result[0].attempts).toBe(2);
    expect(result[0].conversions).toBe(1);
    expect(result[0].conversionPct).toBe(50);

    // 7-10 split appears once
    expect(result[1].pins).toEqual([7, 10]);
    expect(result[1].attempts).toBe(1);
    expect(result[1].conversions).toBe(1);
    expect(result[1].conversionPct).toBe(100);
  });

  it("ignores strikes", () => {
    const strikeFrames = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE));
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, strikeFrames)])
    ];
    expect(calculateCommonLeaves(sessions)).toEqual([]);
  });

  it("sorts by frequency descending", () => {
    // 7-pin leave once, 10-pin leave three times
    const f1 = frame(1, [10 as PinNumber], NONE);
    const f2 = frame(2, [10 as PinNumber], NONE);
    const f3 = frame(3, [10 as PinNumber], NONE);
    const f4 = frame(4, [7 as PinNumber], NONE);
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, [f1, f2, f3, f4])])
    ];
    const result = calculateCommonLeaves(sessions);

    expect(result[0].pins).toEqual([10]);
    expect(result[0].attempts).toBe(3);
    expect(result[1].pins).toEqual([7]);
    expect(result[1].attempts).toBe(1);
  });

  it("tie-breaks equal attempts by fewer pins, then lower pin number", () => {
    // Three leaves each with 1 attempt: [3,10], [7], [10]
    // Expected order: [7] (1 pin, lower) before [10] (1 pin, higher) before [3,10] (2 pins)
    const f1 = frame(1, [3 as PinNumber, 10 as PinNumber], NONE);
    const f2 = frame(2, [10 as PinNumber], NONE);
    const f3 = frame(3, [7 as PinNumber], NONE);
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, [f1, f2, f3])])
    ];
    const result = calculateCommonLeaves(sessions);

    expect(result).toHaveLength(3);
    // All have 1 attempt; then fewer pins first; then lower pin first
    expect(result[0].pins).toEqual([7]);   // 1-pin, pin 7 (lower)
    expect(result[1].pins).toEqual([10]);  // 1-pin, pin 10 (higher)
    expect(result[2].pins).toEqual([3, 10]); // 2-pins
  });
});

describe("filterSessionsBy", () => {
  const makeSession = (
    alley: string,
    oilPattern: string | undefined,
    gamesData: Array<{ lane?: string }>
  ): SessionSummary => ({
    session: { date: "2026-06-01", alley_name: alley, oil_pattern: oilPattern },
    games: gamesData.map((g, i) => ({
      id: i + 1,
      session_id: 1,
      game_number: i + 1,
      lane_number: g.lane,
      frames: []
    }))
  });

  it("returns all sessions when no filter applied", () => {
    const sessions = [
      makeSession("Alley A", "Sport", [{ lane: "1" }]),
      makeSession("Alley B", "House", [{ lane: "2" }])
    ];
    expect(filterSessionsBy(sessions, {})).toHaveLength(2);
  });

  it("filters by alley name (case-insensitive)", () => {
    const sessions = [
      makeSession("Bowlero", undefined, [{}]),
      makeSession("AMF", undefined, [{}])
    ];
    const result = filterSessionsBy(sessions, { alleyName: "bowlero" });
    expect(result).toHaveLength(1);
    expect(result[0].session.alley_name).toBe("Bowlero");
  });

  it("filters by oil pattern (contains, case-insensitive)", () => {
    const sessions = [
      makeSession("Lanes A", "PBA Wolf", [{}]),
      makeSession("Lanes B", "House Shot", [{}]),
      makeSession("Lanes C", "PBA Bear", [{}])
    ];
    const result = filterSessionsBy(sessions, { oilPattern: "pba" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.session.alley_name)).toEqual(["Lanes A", "Lanes C"]);
  });

  it("filters games by lane number within a session", () => {
    const sessions = [
      makeSession("Alley", undefined, [{ lane: "5" }, { lane: "6" }, { lane: "5" }])
    ];
    const result = filterSessionsBy(sessions, { laneNumber: "5" });
    expect(result).toHaveLength(1);
    expect(result[0].games).toHaveLength(2);
  });

  it("excludes sessions where no games match the lane filter", () => {
    const sessions = [
      makeSession("Alley A", undefined, [{ lane: "1" }]),
      makeSession("Alley B", undefined, [{ lane: "2" }])
    ];
    const result = filterSessionsBy(sessions, { laneNumber: "3" });
    expect(result).toHaveLength(0);
  });

  it("matches either lane of a cross-lane game", () => {
    const sessions: SessionSummary[] = [
      {
        session: { date: "2026-06-01", alley_name: "Cross", oil_pattern: undefined },
        games: [
          { id: 1, session_id: 1, game_number: 1, lanes: ["9", "10"], lane_number: "9", frames: [] }
        ]
      }
    ];
    // The second lane of the pair must still match (was the cross-lane bug).
    expect(filterSessionsBy(sessions, { laneNumber: "10" })).toHaveLength(1);
    expect(filterSessionsBy(sessions, { laneNumber: "9" })).toHaveLength(1);
    expect(filterSessionsBy(sessions, { laneNumber: "11" })).toHaveLength(0);
  });
});

describe("spare rate: real-split exclusion", () => {
  it("a real split is excluded from spare rate numerator AND denominator", () => {
    // Frame 1: real split [4,6] — not converted (should be excluded entirely)
    // Frame 2: normal leave [10] — not converted (spare opp, not made)
    // Expected: sparePct = 0/1 = 0% (only frame 2 counts)
    const f1 = frame(1, [4 as PinNumber, 6 as PinNumber], [4 as PinNumber, 6 as PinNumber]);
    const f2 = frame(2, [10 as PinNumber], [10 as PinNumber]);
    const sessions: SessionSummary[] = [session("Lanes", [game(undefined, [f1, f2])])];
    const stats = calculateStats(sessions);
    expect(stats.sparePct).toBe(0); // 0/1
  });

  it("a baby split IS counted as a spare opportunity", () => {
    // Frame 1: baby split [3,10] — converted (spare opp, made)
    // Frame 2: baby split [9,10] — not converted (spare opp, not made)
    // Expected: sparePct = 1/2 = 50%
    const f1 = frame(1, [3 as PinNumber, 10 as PinNumber], NONE);
    const f2 = frame(2, [9 as PinNumber, 10 as PinNumber], [9 as PinNumber, 10 as PinNumber]);
    const sessions: SessionSummary[] = [session("Lanes", [game(undefined, [f1, f2])])];
    const stats = calculateStats(sessions);
    expect(stats.sparePct).toBe(50); // 1/2
  });

  it("a washout is excluded from spare rate numerator AND denominator", () => {
    // Frame 1: washout [1,2,10] — not converted (excluded entirely)
    // Frame 2: normal leave [10] — converted (spare opp, made)
    // Expected: sparePct = 1/1 = 100% (only frame 2 counts)
    const f1 = frame(
      1,
      [1 as PinNumber, 2 as PinNumber, 10 as PinNumber],
      [1 as PinNumber, 2 as PinNumber, 10 as PinNumber]
    );
    const f2 = frame(2, [10 as PinNumber], NONE);
    const sessions: SessionSummary[] = [session("Lanes", [game(undefined, [f1, f2])])];
    const stats = calculateStats(sessions);
    expect(stats.sparePct).toBe(100); // 1/1
  });

  it("real split exclusion does not affect strike% count", () => {
    // Frame 1: strike. Frame 2: real split [7,10] not converted.
    // strikeOpps = 2, strikes = 1 → 50%
    const f1 = frame(1, NONE);
    const f2 = frame(2, [7 as PinNumber, 10 as PinNumber], [7 as PinNumber, 10 as PinNumber]);
    const sessions: SessionSummary[] = [session("Lanes", [game(undefined, [f1, f2])])];
    const stats = calculateStats(sessions);
    expect(stats.strikePct).toBe(50);
    expect(stats.sparePct).toBeNull(); // no spare opps (only split left, excluded)
  });
});

describe("frame-level lane filtering", () => {
  // Cross-lane: frame 1 (lane 9, strike), frame 2 (lane 10, open).
  const crossLane: SessionSummary[] = [
    {
      session: { date: "2026-06-07", alley_name: "Cross" },
      games: [
        {
          id: 1,
          session_id: 1,
          game_number: 1,
          lanes: ["9", "10"],
          start_lane: "9",
          frames: [frame(1, NONE), frame(2, [10] as PinNumber[], [10] as PinNumber[])]
        }
      ]
    }
  ];

  it("strike% counts every frame when no lane filter", () => {
    expect(calculateStats(crossLane).strikePct).toBe(50); // 1 strike of 2 frames
  });

  it("strike% counts only frames on the selected lane", () => {
    expect(calculateStats(crossLane, ["9"]).strikePct).toBe(100); // odd frames
    expect(calculateStats(crossLane, ["10"]).strikePct).toBe(0); // even frames
  });

  it("common leaves respect the lane filter", () => {
    expect(calculateCommonLeaves(crossLane, ["9"])).toHaveLength(0);
    expect(calculateCommonLeaves(crossLane, ["10"]).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Pocket and carry
// ---------------------------------------------------------------------------

/** A frame whose first ball leaves `leave`, with an explicit pocket verdict. */
function frameWithPocket(n: number, leave: PinNumber[], pocket?: boolean): Frame {
  const f = frame(n, leave, leave.length ? NONE : undefined);
  f.shots[0].pocket_hit = pocket;
  return f;
}

describe("pocket and carry", () => {
  it("infers the pocket from the leave when no verdict was recorded", () => {
    // 10-pin (pocket), 3-6-10 (not), strike (pocket, and a carry).
    const s = session("Jurong", [
      game(180, [frame(1, [10], NONE), frame(2, [3, 6, 10], [3, 6, 10]), frame(3, NONE)])
    ]);
    const stats = calculateStats([s]);
    expect(stats.pocketPct).toBe(67); // 2 of 3
    expect(stats.carryPct).toBe(50); // 1 strike from 2 pocket hits
  });

  it("lets a recorded verdict override the inference", () => {
    // A crossover strike the bowler flagged as not-pocket.
    const s = session("Jurong", [game(180, [frameWithPocket(1, NONE, false), frame(2, [10], NONE)])]);
    const stats = calculateStats([s]);
    expect(stats.pocketPct).toBe(50);
    expect(stats.carryPct).toBe(0); // the only strike was not a pocket hit
  });

  it("mirrors the inference for a left-hander", () => {
    // The 2 is a lefty pocket pin, so leaving it is never a lefty pocket hit.
    // For a right-hander the same leave is an ordinary light hit.
    const s = session("Jurong", [game(150, [frame(1, [2], NONE)])]);
    expect(calculateStats([s], undefined, "right").pocketPct).toBe(100);
    expect(calculateStats([s], undefined, "left").pocketPct).toBe(0);
  });

  it("counts only fresh-rack balls, including the 10th frame bonus balls", () => {
    // 10th: strike, strike, 3-pin left. Three fresh-rack balls, two strikes,
    // and the last one is not a pocket hit.
    const s = session("Jurong", [game(200, [frame(10, NONE, NONE, [3])])]);
    const stats = calculateStats([s]);
    expect(stats.strikePct).toBe(67);
    expect(stats.pocketPct).toBe(67);
    expect(stats.carryPct).toBe(100);
  });
});

describe("leaves in the 10th frame", () => {
  it("counts a leave made by a bonus ball at a full rack", () => {
    // Strike, strike, then a 9 count: three fresh-rack balls, and the last one
    // leaves the 10 pin. Reading shot 1 alone missed it entirely.
    const s = session("Jurong", [game(259, [frame(10, NONE, NONE, [10])])]);
    const leaves = calculateCommonLeaves([s]);
    expect(leaves.map((l) => [l.pins, l.attempts, l.conversions])).toEqual([[[10], 1, 0]]);
  });

  it("does not score the last ball's leave as a missed spare", () => {
    // Strike, strike, then a 9 count. No ball can follow it, so it is a leave
    // that happened with no spare chance: out of the rate, not a 0%.
    const s = session("Jurong", [game(259, [frame(10, NONE, NONE, [10])])]);
    const [ten] = calculateCommonLeaves([s]);
    expect(ten.attempts).toBe(1);
    expect(ten.chances).toBe(0);
    expect(ten.conversionPct).toBeNull();
  });

  it("keeps a frame still being bowled out of the rate", () => {
    // Ball 1 left the 10 pin and ball 2 has not been thrown yet.
    const s = session("Jurong", [game(undefined, [frame(3, [10 as PinNumber])])]);
    const [ten] = calculateCommonLeaves([s]);
    expect(ten.attempts).toBe(1);
    expect(ten.chances).toBe(0);
    expect(ten.conversionPct).toBeNull();
  });

  it("mixes chance and no-chance instances of the same leave", () => {
    // 10 pin left three times: made once, missed once, and once off the last
    // ball of the 10th. Rate reads 1 of 2, with the third counted as left.
    const s = session("Jurong", [
      game(160, [
        frame(1, [10 as PinNumber], NONE),
        frame(2, [10 as PinNumber], [10 as PinNumber]),
        frame(10, NONE, NONE, [10])
      ])
    ]);
    const [ten] = calculateCommonLeaves([s]);
    expect(ten.attempts).toBe(3);
    expect(ten.chances).toBe(2);
    expect(ten.conversions).toBe(1);
    expect(ten.conversionPct).toBe(50);
  });

  it("counts the ball-2 leave after a 10th-frame strike, and its conversion", () => {
    // Strike, then 9, then spare: the leave belongs to ball 2 and ball 3 made it.
    const s = session("Jurong", [game(200, [frame(10, NONE, [7], NONE)])]);
    const leaves = calculateCommonLeaves([s]);
    expect(leaves.map((l) => [l.pins, l.attempts, l.conversions])).toEqual([[[7], 1, 1]]);
  });

  it("still ignores a spare attempt, which is not thrown at a full rack", () => {
    // 8 then a spare: one leave, converted. The spare ball leaves nothing.
    const s = session("Jurong", [game(150, [frame(10, [2, 4], NONE, NONE)])]);
    const leaves = calculateCommonLeaves([s]);
    expect(leaves.map((l) => [l.pins, l.attempts, l.conversions])).toEqual([[[2, 4], 1, 1]]);
  });
});

describe("calculateBallPerformance", () => {
  const balls: Ball[] = [
    { id: 1, name: "Phaze II", is_spare_ball: false },
    { id: 2, name: "Hy-Road", is_spare_ball: false }
  ];

  function ballFrame(n: number, ballId: number | undefined, leave: PinNumber[]): Frame {
    const f = frame(n, leave, leave.length ? NONE : undefined);
    f.shots[0].ball_id = ballId;
    return f;
  }

  it("splits rates by ball and by game number", () => {
    const g1: Game & { frames: Frame[] } = {
      id: 1,
      session_id: 1,
      game_number: 1,
      final_score: 200,
      frames: [ballFrame(1, 1, NONE), ballFrame(2, 1, [10])]
    };
    const g2: Game & { frames: Frame[] } = {
      id: 2,
      session_id: 1,
      game_number: 2,
      final_score: 150,
      frames: [ballFrame(1, 1, [3, 6, 10]), ballFrame(2, 2, NONE)]
    };
    const report = calculateBallPerformance(session("Jurong", [g1, g2]) && [session("Jurong", [g1, g2])], balls);

    const phaze = report.balls.find((b) => b.ballId === 1)!;
    expect(phaze.firstBalls).toBe(3);
    expect(phaze.strikePct).toBe(33);
    expect(phaze.pocketPct).toBe(67);
    expect(phaze.carryPct).toBe(50);
    expect(phaze.byGame.map((c) => [c.gameNumber, c.firstBalls, c.strikes])).toEqual([
      [1, 2, 1],
      [2, 1, 0]
    ]);
    // Equal attempts, so the tie-break decides: fewer pins first, the way the
    // leaves card orders them.
    expect(phaze.leaves.map((l) => l.pins)).toEqual([[10], [3, 6, 10]]);
  });

  it("names the games behind each per-game cell, newest session first", () => {
    const g1: Game & { frames: Frame[] } = {
      id: 11,
      session_id: 1,
      game_number: 1,
      final_score: 200,
      frames: [ballFrame(1, 1, NONE), ballFrame(2, 1, [10])]
    };
    const g2: Game & { frames: Frame[] } = {
      id: 22,
      session_id: 2,
      game_number: 1,
      final_score: 150,
      frames: [ballFrame(1, 1, NONE)]
    };
    const older: SessionSummary = {
      session: { id: 1, date: "2026-06-01", alley_name: "Jurong" },
      games: [g1]
    };
    const newer: SessionSummary = {
      session: { id: 2, date: "2026-08-19", alley_name: "Serangoon", oil_pattern: "Chromium" },
      games: [g2]
    };

    const cell = calculateBallPerformance([older, newer], balls).balls[0].byGame[0];
    expect(cell.firstBalls).toBe(3);
    expect(cell.sessions).toEqual([
      {
        sessionId: 2,
        gameId: 22,
        date: "2026-08-19",
        alley: "Serangoon",
        event: undefined,
        oilPattern: "Chromium",
        firstBalls: 1,
        pocket: 1,
        strikes: 1,
        pocketStrikes: 1
      },
      {
        sessionId: 1,
        gameId: 11,
        date: "2026-06-01",
        alley: "Jurong",
        event: undefined,
        oilPattern: undefined,
        firstBalls: 2,
        pocket: 2,
        strikes: 1,
        pocketStrikes: 1
      }
    ]);
  });

  it("leaves out games with no id, which there is nothing to navigate to", () => {
    const g: Game & { frames: Frame[] } = {
      session_id: 1,
      game_number: 1,
      final_score: 150,
      frames: [ballFrame(1, 1, NONE)]
    };
    const report = calculateBallPerformance([session("Jurong", [g])], balls);
    expect(report.balls[0].byGame[0].firstBalls).toBe(1);
    expect(report.balls[0].byGame[0].sessions).toEqual([]);
  });

  it("attributes a 10th-frame bonus-ball leave to the ball that threw it", () => {
    const tenth: Frame = {
      game_id: 1,
      frame_number: 10,
      shots: [
        { pins_standing: NONE, ball_id: 1 },
        { pins_standing: NONE, ball_id: 1 },
        { pins_standing: [10], ball_id: 2 }
      ],
      is_strike: true,
      is_spare: false
    };
    const g: Game & { frames: Frame[] } = {
      id: 1,
      session_id: 1,
      game_number: 1,
      final_score: 259,
      frames: [tenth]
    };
    const report = calculateBallPerformance([session("Jurong", [g])], balls);
    expect(report.balls.find((b) => b.ballId === 1)!.leaves).toEqual([]);
    expect(report.balls.find((b) => b.ballId === 2)!.leaves.map((l) => l.pins)).toEqual([[10]]);
  });

  it("reports fresh-rack balls with no ball recorded instead of dropping them", () => {
    const g: Game & { frames: Frame[] } = {
      id: 1,
      session_id: 1,
      game_number: 1,
      final_score: 150,
      frames: [ballFrame(1, undefined, NONE), ballFrame(2, 1, NONE)]
    };
    const report = calculateBallPerformance([session("Jurong", [g])], balls);
    expect(report.unattributed).toBe(1);
    expect(report.balls).toHaveLength(1);
  });

  it("sorts by balls thrown, so one lucky strike cannot top the list", () => {
    const worked = Array.from({ length: 20 }, (_, i) => ballFrame((i % 9) + 1, 1, [3]));
    const lucky = [ballFrame(1, 2, NONE)];
    const g: Game & { frames: Frame[] } = {
      id: 1,
      session_id: 1,
      game_number: 1,
      final_score: 150,
      frames: [...worked, ...lucky]
    };
    const report = calculateBallPerformance([session("Jurong", [g])], balls);
    expect(report.balls[0].ballId).toBe(1); // 20 balls
    expect(report.balls[1].strikePct).toBe(100); // 1 ball, still shown raw
    expect(report.balls[1].firstBalls).toBe(1);
  });

});
