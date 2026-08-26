import { describe, expect, it } from "vitest";
import {
  calculateBallPerformance,
  calculateCommonLeaves,
  calculateGameNumberTrend,
  calculateOpenFrames,
  calculateSessionMetrics,
  calculateSessionTrend,
  calculateStats,
  filterSessionsBy,
  findRateLeaders
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
      firstBallAverage: null,
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

describe("calculateSessionTrend", () => {
  const night = (
    date: string,
    games: Array<{ score?: number; lanes?: string[] }>
  ): SessionSummary => ({
    session: { id: 1, date, alley_name: "Jurong", description: "League night" },
    games: games.map((g, i) => ({
      id: i + 1,
      session_id: 1,
      game_number: i + 1,
      final_score: g.score,
      lanes: g.lanes,
      frames: []
    })) as SessionSummary["games"]
  });

  it("averages a night's completed games, oldest night first", () => {
    const trend = calculateSessionTrend([
      night("2026-08-05", [{ score: 200 }, { score: 220 }]),
      night("2026-06-01", [{ score: 150 }])
    ]);
    expect(trend.map((p) => [p.date, p.average])).toEqual([
      ["2026-06-01", 150],
      ["2026-08-05", 210]
    ]);
  });

  it("leaves out a game that never touched a selected lane", () => {
    const trend = calculateSessionTrend(
      [night("2026-08-05", [{ score: 300, lanes: ["3", "4"] }, { score: 100, lanes: ["9", "10"] }])],
      ["3"]
    );
    expect(trend[0].scores).toEqual([300]);
    expect(trend[0].average).toBe(300);
  });

  it("drops a night whose games were all on other lanes", () => {
    const trend = calculateSessionTrend(
      [night("2026-08-05", [{ score: 200, lanes: ["5", "6"] }])],
      ["3"]
    );
    expect(trend).toEqual([]);
  });

  it("drops a night with nothing scored yet rather than plotting a zero", () => {
    expect(calculateSessionTrend([night("2026-08-05", [{}])])).toEqual([]);
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
        lanes: [],
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
        lanes: [],
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

function numberedGame(
  gameNumber: number,
  finalScore: number | undefined,
  frames: Frame[]
): Game & { frames: Frame[] } {
  return { id: gameNumber, session_id: 1, game_number: gameNumber, final_score: finalScore, frames };
}

/** Nine strikes and a 10th that opens on the given leave, left standing. */
function gameOpeningOn(leave: PinNumber[], finalScore = 200): Game & { frames: Frame[] } {
  return game(finalScore, [
    ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
    frame(10, leave, leave)
  ]);
}

describe("filterSessionsBy game number", () => {
  const strikes = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)).concat(
    frame(10, NONE, NONE, NONE)
  );

  const sessions: SessionSummary[] = [
    {
      session: { date: "2026-06-07", alley_name: "Sea Bowl" },
      games: [numberedGame(1, 200, strikes), numberedGame(2, 180, strikes)]
    },
    {
      session: { date: "2026-06-14", alley_name: "Sea Bowl" },
      games: [numberedGame(1, 210, strikes)]
    }
  ];

  it("keeps only that position in the night", () => {
    const filtered = filterSessionsBy(sessions, { gameNumber: 2 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].games.map((g) => g.final_score)).toEqual([180]);
  });

  it("drops a session that never reached that game", () => {
    expect(filterSessionsBy(sessions, { gameNumber: 3 })).toEqual([]);
  });

  it("slices the whole stats block, not just the trend", () => {
    const stats = calculateStats(filterSessionsBy(sessions, { gameNumber: 1 }));
    expect(stats.completedGames).toBe(2);
    expect(stats.averageScore).toBe(205);
  });
});

describe("calculateOpenFrames", () => {
  it("reports nothing for no data", () => {
    const report = calculateOpenFrames([]);
    expect(report.games).toBe(0);
    expect(report.openFramesPerGame).toBeNull();
    expect(report.pinsLostPerGame).toBeNull();
    expect(report.leaves).toEqual([]);
    expect(report.trend).toEqual([]);
  });

  it("counts every open frame in the headline, splits included", () => {
    const sessions = [
      session("Sea Bowl", [
        gameOpeningOn([10]),
        gameOpeningOn([7, 10]),
        gameOpeningOn([1, 2, 10])
      ])
    ];
    const report = calculateOpenFrames(sessions);
    expect(report.openFrames).toBe(3);
    expect(report.openFramesPerGame).toBe(1);
  });

  it("breaks the same opens into makeable, washout and split", () => {
    const sessions = [
      session("Sea Bowl", [
        gameOpeningOn([10]),
        gameOpeningOn([7, 10]),
        gameOpeningOn([1, 2, 10])
      ])
    ];
    const report = calculateOpenFrames(sessions);
    expect(report.makeable.openFrames).toBe(1);
    expect(report.split.openFrames).toBe(1);
    expect(report.washout.openFrames).toBe(1);
    // The three account for every open, with nothing double counted.
    expect(report.makeable.openFrames + report.split.openFrames + report.washout.openFrames).toBe(
      report.openFrames
    );
  });

  it("prices an open frame at the rule of thumb", () => {
    const sessions = [session("Sea Bowl", [gameOpeningOn([10]), gameOpeningOn([10])])];
    const report = calculateOpenFrames(sessions);
    expect(report.openFramesPerGame).toBe(1);
    expect(report.pinsLostPerGame).toBe(11);
  });

  it("keeps splits and washouts off the leave list", () => {
    const sessions = [
      session("Sea Bowl", [gameOpeningOn([7, 10]), gameOpeningOn([1, 2, 10]), gameOpeningOn([10])])
    ];
    expect(calculateOpenFrames(sessions).leaves.map((l) => l.pins)).toEqual([[10]]);
  });

  it("reports a leave as opens a game, not as a raw count", () => {
    // Three 10 pins missed across four games.
    const sessions = [
      session("Sea Bowl", [
        gameOpeningOn([10]),
        gameOpeningOn([10]),
        gameOpeningOn([10]),
        gameOpeningOn([2, 4, 5])
      ])
    ];
    const tenPin = calculateOpenFrames(sessions).leaves[0];
    expect(tenPin).toMatchObject({ pins: [10], misses: 3 });
    expect(tenPin.perGame).toBe(0.8);
  });

  it("keeps a converted leave off the list but in its rate", () => {
    const g = game(190, [
      ...Array.from({ length: 8 }, (_, i) => frame(i + 1, NONE)),
      frame(9, [10], NONE),
      frame(10, [10], [10])
    ]);
    const report = calculateOpenFrames([session("Sea Bowl", [g])]);
    expect(report.openFrames).toBe(1);
    expect(report.leaves[0]).toMatchObject({
      pins: [10],
      chances: 2,
      conversions: 1,
      misses: 1,
      conversionPct: 50
    });
  });

  it("drops a leave that was never missed", () => {
    const g = game(190, [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      frame(10, [10], NONE, NONE)
    ]);
    expect(calculateOpenFrames([session("Sea Bowl", [g])]).leaves).toEqual([]);
  });

  it("ignores a game still being bowled", () => {
    const inProgress = game(undefined, [frame(1, [10], [10])]);
    const report = calculateOpenFrames([session("Sea Bowl", [inProgress])]);
    expect(report.games).toBe(0);
    expect(report.openFrames).toBe(0);
    expect(report.trend).toEqual([]);
  });

  it("plots every open per night, oldest first", () => {
    const clean = game(200, [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      frame(10, [10], NONE, NONE)
    ]);
    const sessions: SessionSummary[] = [
      {
        session: { id: 2, date: "2026-06-14", alley_name: "Sea Bowl" },
        games: [clean]
      },
      {
        session: { id: 1, date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [gameOpeningOn([10]), gameOpeningOn([7, 10])]
      }
    ];
    const { trend } = calculateOpenFrames(sessions);
    expect(trend.map((t) => t.date)).toEqual(["2026-06-07", "2026-06-14"]);
    // The split counts on the line even though it is not on the leave list.
    expect(trend[0]).toMatchObject({ games: 2, openFrames: 2, perGame: 1 });
    expect(trend[1]).toMatchObject({ games: 1, openFrames: 0, perGame: 0 });
  });
});

describe("first ball average", () => {
  it("is null with nothing thrown", () => {
    expect(calculateStats([]).firstBallAverage).toBeNull();
  });

  it("is ten for a perfect game", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      frame(10, NONE, NONE, NONE)
    ];
    expect(calculateStats([session("Sea Bowl", [game(300, frames)])]).firstBallAverage).toBe(10);
  });

  it("averages the pins each fresh-rack ball knocked down", () => {
    // Nine first balls leaving one pin, and a 10th of 9 then a miss.
    const frames = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], NONE)),
      frame(10, [10], [10])
    ];
    // Ten fresh-rack balls, every one of them a 9.
    expect(calculateStats([session("Sea Bowl", [game(150, frames)])]).firstBallAverage).toBe(9);
  });

  it("counts the 10th frame's bonus balls, like strike and pocket do", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      // Strike, strike, then a 4: three fresh-rack balls of 10, 10 and 4.
      frame(10, NONE, NONE, [1, 2, 3, 4, 5, 6])
    ];
    const stats = calculateStats([session("Sea Bowl", [game(280, frames)])]);
    // Eleven balls: nine tens, one ten, one four.
    expect(stats.firstBallAverage).toBe(9.5);
  });
});

describe("calculateGameNumberTrend", () => {
  it("returns nothing for no data", () => {
    expect(calculateGameNumberTrend([])).toEqual([]);
  });

  it("groups by position in the night, oldest slot first", () => {
    const strikes = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)).concat(
      frame(10, NONE, NONE, NONE)
    );
    const opens = Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], [10])).concat(
      frame(10, [10], [10])
    );
    const sessions: SessionSummary[] = [
      {
        session: { date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [numberedGame(1, 300, strikes), numberedGame(2, 120, opens)]
      },
      {
        session: { date: "2026-06-14", alley_name: "Sea Bowl" },
        games: [numberedGame(1, 200, strikes), numberedGame(2, 140, opens)]
      }
    ];

    const trend = calculateGameNumberTrend(sessions);
    expect(trend.map((t) => t.gameNumber)).toEqual([1, 2]);
    expect(trend[0]).toMatchObject({ games: 2, average: 250, strikePct: 100 });
    expect(trend[1]).toMatchObject({ games: 2, average: 130, strikePct: 0 });
  });

  it("keeps a thin slot in the list, with its count", () => {
    const strikes = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)).concat(
      frame(10, NONE, NONE, NONE)
    );
    const sessions: SessionSummary[] = [
      {
        session: { date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [numberedGame(1, 200, strikes), numberedGame(2, 180, strikes), numberedGame(3, 150, strikes)]
      },
      {
        session: { date: "2026-06-14", alley_name: "Sea Bowl" },
        games: [numberedGame(1, 210, strikes), numberedGame(2, 190, strikes)]
      }
    ];

    const trend = calculateGameNumberTrend(sessions);
    expect(trend).toHaveLength(3);
    expect(trend[2]).toMatchObject({ gameNumber: 3, games: 1, average: 150 });
  });

  it("carries the same first-ball rates as the whole-history stats", () => {
    // Every first ball a pocket hit; nine of ten carry.
    const carried = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)).concat(
      frame(10, [10], NONE, NONE)
    );
    const sessions: SessionSummary[] = [
      {
        session: { date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [numberedGame(1, 240, carried)]
      }
    ];
    const trend = calculateGameNumberTrend(sessions);
    const whole = calculateStats(sessions);
    expect(trend[0].pocketPct).toBe(whole.pocketPct);
    expect(trend[0].carryPct).toBe(whole.carryPct);
  });

  it("counts an unscored game's frames but not its average", () => {
    const opens = Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], [10])).concat(
      frame(10, [10], [10])
    );
    const sessions: SessionSummary[] = [
      {
        session: { date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [numberedGame(1, undefined, opens)]
      }
    ];
    const trend = calculateGameNumberTrend(sessions);
    expect(trend[0]).toMatchObject({ games: 0, average: null, strikePct: 0 });
  });
});

describe("findRateLeaders", () => {
  function ballPerf(
    ballId: number,
    firstBalls: number,
    pocketPct: number | null,
    carryPct: number | null,
    strikePct: number | null
  ) {
    return {
      ballId,
      name: `Ball ${ballId}`,
      imageThumb: null,
      brand: null,
      firstBalls,
      pocketPct,
      carryPct,
      strikePct,
      byGame: [],
      leaves: []
    };
  }

  it("crowns nothing without two balls to compare", () => {
    expect(findRateLeaders([])).toEqual({ pocketPct: null, carryPct: null, strikePct: null });
    expect(findRateLeaders([ballPerf(1, 50, 60, 50, 30)])).toEqual({
      pocketPct: null,
      carryPct: null,
      strikePct: null
    });
  });

  it("takes the best in each column independently", () => {
    const leaders = findRateLeaders([
      ballPerf(1, 40, 70, 40, 28),
      ballPerf(2, 40, 55, 62, 34)
    ]);
    expect(leaders).toEqual({ pocketPct: 70, carryPct: 62, strikePct: 34 });
  });

  it("ignores a ball under the minimum, however good it looks", () => {
    const leaders = findRateLeaders([
      ballPerf(1, 40, 70, 40, 28),
      ballPerf(2, 40, 55, 62, 34),
      // Three balls thrown, all of them strikes. Not a leader.
      ballPerf(3, 3, 100, 100, 100)
    ]);
    expect(leaders).toEqual({ pocketPct: 70, carryPct: 62, strikePct: 34 });
  });

  it("needs two ELIGIBLE balls, not two balls", () => {
    const leaders = findRateLeaders([ballPerf(1, 40, 70, 40, 28), ballPerf(2, 4, 90, 90, 90)]);
    expect(leaders).toEqual({ pocketPct: null, carryPct: null, strikePct: null });
  });

  it("returns the value, so a tie can light both balls", () => {
    const leaders = findRateLeaders([
      ballPerf(1, 40, 64, 40, 28),
      ballPerf(2, 40, 64, 62, 34)
    ]);
    expect(leaders.pocketPct).toBe(64);
  });

  it("skips a null rate rather than treating it as zero", () => {
    const leaders = findRateLeaders([
      ballPerf(1, 40, 70, null, 28),
      ballPerf(2, 40, 55, null, 34)
    ]);
    expect(leaders.carryPct).toBeNull();
    expect(leaders.pocketPct).toBe(70);
  });
});

describe("calculateSessionMetrics", () => {
  const strikes = [
    ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
    frame(10, NONE, NONE, NONE)
  ];
  // Every fresh-rack ball leaves the 10 pin, the 10th frame's bonus ball
  // included, so this game has no strike in it anywhere.
  const nines = [
    ...Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], NONE)),
    frame(10, [10], NONE, [10])
  ];

  it("returns nothing for no data", () => {
    expect(calculateSessionMetrics([])).toEqual([]);
  });

  it("gives one point per night, oldest first", () => {
    const sessions: SessionSummary[] = [
      {
        session: { id: 2, date: "2026-06-14", alley_name: "Sea Bowl" },
        games: [game(180, nines)]
      },
      {
        session: { id: 1, date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [game(300, strikes)]
      }
    ];
    const points = calculateSessionMetrics(sessions);
    expect(points.map((p) => p.date)).toEqual(["2026-06-07", "2026-06-14"]);
    expect(points[0].stats.strikePct).toBe(100);
    expect(points[1].stats.strikePct).toBe(0);
  });

  it("agrees with the whole-history block when there is one night", () => {
    const sessions = [session("Sea Bowl", [game(300, strikes)])];
    const [point] = calculateSessionMetrics(sessions);
    const whole = calculateStats(sessions);
    // The graph and the tile above it are the same call, so they cannot drift.
    expect(point.stats).toEqual(whole);
  });

  it("drops a night with nothing scored yet", () => {
    const sessions = [
      {
        session: { id: 1, date: "2026-06-07", alley_name: "Sea Bowl" },
        games: [game(undefined, [frame(1, [10], [10])])]
      }
    ];
    expect(calculateSessionMetrics(sessions)).toEqual([]);
  });

  it("carries the games behind each point", () => {
    const sessions = [session("Sea Bowl", [game(300, strikes), game(180, nines)])];
    expect(calculateSessionMetrics(sessions)[0].games).toBe(2);
  });

  it("drops a night that never touched a selected lane", () => {
    const onEleven: Game & { frames: Frame[] } = {
      id: 1,
      session_id: 1,
      game_number: 1,
      lanes: ["11"],
      final_score: 300,
      frames: strikes
    };
    const sessions = [session("Sea Bowl", [onEleven])];
    expect(calculateSessionMetrics(sessions, ["12"])).toEqual([]);
    expect(calculateSessionMetrics(sessions, ["11"])).toHaveLength(1);
  });
});
