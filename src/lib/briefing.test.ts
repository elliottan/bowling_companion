import { describe, expect, it } from "vitest";
import { buildBriefing } from "./briefing";
import type { Ball, Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

const NONE: PinNumber[] = [];

function frame(n: number, s1: PinNumber[], s2?: PinNumber[], meta?: Partial<Shot>): Frame {
  const shots: Shot[] = [{ pins_standing: s1, ...meta }];
  if (s2 !== undefined) shots.push({ pins_standing: s2 });
  return {
    game_id: 1,
    frame_number: n,
    shots,
    is_strike: s1.length === 0,
    is_spare: s1.length > 0 && s2?.length === 0
  };
}

/** A game of `strikes` strikes and the rest open on the 10 pin. */
function game(
  gameNumber: number,
  finalScore: number,
  strikes: number,
  opts: { ballId?: number; lanes?: string[]; spare?: boolean } = {}
): Game & { frames: Frame[] } {
  const frames: Frame[] = [];
  for (let f = 1; f <= 10; f++) {
    const meta = opts.ballId ? { ball_id: opts.ballId, pocket_hit: true } : { pocket_hit: true };
    if (f <= strikes) frames.push(frame(f, NONE, undefined, meta));
    else frames.push(frame(f, [10], opts.spare ? NONE : [10], meta));
  }
  return {
    id: gameNumber,
    session_id: 1,
    game_number: gameNumber,
    lanes: opts.lanes ?? ["11", "12"],
    start_lane: (opts.lanes ?? ["11", "12"])[0],
    final_score: finalScore,
    frames
  };
}

function session(
  date: string,
  alley: string,
  games: Array<Game & { frames: Frame[] }>,
  pattern?: string
): SessionSummary {
  return {
    session: { id: Number(date.replace(/-/g, "")), date, alley_name: alley, oil_pattern: pattern },
    games
  };
}

/** Three games a night, `nights` nights, all the same. */
function nights(
  count: number,
  alley: string,
  score: number,
  strikes: number,
  opts: { ballId?: number; startDay?: number; spare?: boolean; pattern?: string } = {}
): SessionSummary[] {
  return Array.from({ length: count }, (_, i) =>
    session(
      `2026-06-${String((opts.startDay ?? 1) + i).padStart(2, "0")}`,
      alley,
      [1, 2, 3].map((n) => game(n, score, strikes, opts)),
      opts.pattern
    )
  );
}

const NO_BALLS: Ball[] = [];

describe("buildBriefing", () => {
  it("says nothing at all with no history", () => {
    const briefing = buildBriefing([], NO_BALLS, {});
    expect(briefing.games).toBe(0);
    expect(briefing.callouts).toEqual([]);
    expect(briefing.lastTime).toBeNull();
  });

  it("holds every rule back until the slice is worth reading", () => {
    // One night here, plenty everywhere else.
    const sessions = [
      ...nights(1, "Sea Bowl", 200, 6, { startDay: 1 }),
      ...nights(6, "Palace", 150, 2, { startDay: 10 })
    ];
    const briefing = buildBriefing(sessions, NO_BALLS, { alley: "Sea Bowl" });
    expect(briefing.games).toBe(3);
    expect(briefing.callouts).toEqual([]);
    // And it says what it is waiting for rather than going quiet.
    expect(briefing.gathering.every((g) => g.need === 6 && g.have === 3)).toBe(true);
  });

  it("compares the slice against the rest, not against itself", () => {
    const sessions = [
      ...nights(3, "Sea Bowl", 210, 7, { startDay: 1 }),
      ...nights(3, "Palace", 150, 2, { startDay: 10 })
    ];
    const briefing = buildBriefing(sessions, NO_BALLS, { alley: "Sea Bowl" });
    const expectation = briefing.callouts.find((c) => c.kind === "expectation");
    expect(expectation).toMatchObject({ average: 210, baseline: 150, delta: 60, games: 9 });
  });

  it("stays quiet when the difference is too small to matter", () => {
    const sessions = [
      ...nights(3, "Sea Bowl", 152, 3, { startDay: 1 }),
      ...nights(3, "Palace", 150, 3, { startDay: 10 })
    ];
    const briefing = buildBriefing(sessions, NO_BALLS, { alley: "Sea Bowl" });
    expect(briefing.callouts.find((c) => c.kind === "expectation")).toBeUndefined();
  });

  it("needs a baseline as well as a slice", () => {
    // Everything is at one alley, so there is nothing to compare it to.
    const sessions = nights(4, "Sea Bowl", 200, 6);
    const briefing = buildBriefing(sessions, NO_BALLS, { alley: "Sea Bowl" });
    expect(briefing.callouts.find((c) => c.kind === "expectation")).toBeUndefined();
    expect(briefing.gathering).toContainEqual({ kind: "expectation", have: 0, need: 6 });
  });

  it("filters on pattern as well as location", () => {
    const sessions = [
      ...nights(3, "Sea Bowl", 210, 7, { startDay: 1, pattern: "39 ft Sport" }),
      ...nights(3, "Sea Bowl", 150, 2, { startDay: 10, pattern: "House" })
    ];
    const briefing = buildBriefing(sessions, NO_BALLS, { pattern: "39 ft Sport" });
    expect(briefing.games).toBe(9);
    expect(briefing.callouts.find((c) => c.kind === "expectation")).toMatchObject({
      average: 210,
      baseline: 150
    });
  });

  describe("the ball", () => {
    const balls: Ball[] = [
      { id: 1, name: "Phaze II", is_spare_ball: false },
      { id: 2, name: "IQ Tour", is_spare_ball: false }
    ];

    it("names the best carry against the next one down", () => {
      // Two nights on each ball: one carries every pocket hit, one carries none.
      const sessions = [
        ...nights(2, "Sea Bowl", 220, 10, { ballId: 1, startDay: 1 }),
        ...nights(2, "Sea Bowl", 140, 0, { ballId: 2, startDay: 5 }),
        ...nights(3, "Palace", 150, 3, { startDay: 20 })
      ];
      const briefing = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
      const ball = briefing.callouts.find((c) => c.kind === "ball");
      expect(ball).toMatchObject({ name: "Phaze II", carryPct: 100, runnerUp: "IQ Tour" });
    });

    it("waits for two balls with enough behind them", () => {
      const sessions = [
        ...nights(3, "Sea Bowl", 200, 6, { ballId: 1, startDay: 1 }),
        ...nights(3, "Palace", 150, 3, { startDay: 20 })
      ];
      const briefing = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
      expect(briefing.callouts.find((c) => c.kind === "ball")).toBeUndefined();
      expect(briefing.gathering.some((g) => g.kind === "ball")).toBe(true);
    });
  });

  it("ranks by usefulness before the first ball, not by size of gap", () => {
    // The average gap here is enormous and the ball gap is modest. The ball
    // still leads, because that is the decision you make first.
    const balls: Ball[] = [
      { id: 1, name: "Phaze II", is_spare_ball: false },
      { id: 2, name: "IQ Tour", is_spare_ball: false }
    ];
    const sessions = [
      ...nights(2, "Sea Bowl", 240, 10, { ballId: 1, startDay: 1 }),
      ...nights(2, "Sea Bowl", 200, 6, { ballId: 2, startDay: 5 }),
      ...nights(3, "Palace", 120, 0, { startDay: 20 })
    ];
    const briefing = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
    expect(briefing.callouts[0].kind).toBe("ball");
    expect(briefing.callouts.map((c) => c.kind)).toContain("expectation");
  });

  it("shows three at most", () => {
    const balls: Ball[] = [
      { id: 1, name: "Phaze II", is_spare_ball: false },
      { id: 2, name: "IQ Tour", is_spare_ball: false }
    ];
    const sessions = [
      ...nights(2, "Sea Bowl", 240, 10, { ballId: 1, startDay: 1, spare: true }),
      ...nights(2, "Sea Bowl", 200, 6, { ballId: 2, startDay: 5 }),
      ...nights(4, "Palace", 120, 0, { startDay: 20 })
    ];
    const briefing = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
    expect(briefing.callouts.length).toBeLessThanOrEqual(3);
  });

  describe("last time here", () => {
    it("reads the line off the most recent night, not the first", () => {
      const withLine = (stance: number, target: number, ballId: number) =>
        Array.from({ length: 10 }, (_, i) =>
          frame(i + 1, NONE, undefined, {
            ball_id: ballId,
            intended: { stance, target }
          })
        );

      const sessions: SessionSummary[] = [
        {
          session: { id: 1, date: "2026-06-01", alley_name: "Sea Bowl" },
          games: [{ ...game(1, 200, 10), frames: withLine(10, 5, 1) }]
        },
        {
          session: { id: 2, date: "2026-07-19", alley_name: "Sea Bowl" },
          games: [{ ...game(1, 190, 10), frames: withLine(22, 9, 2) }]
        }
      ];
      const balls: Ball[] = [
        { id: 1, name: "Phaze II", is_spare_ball: false },
        { id: 2, name: "IQ Tour", is_spare_ball: false }
      ];

      const { lastTime } = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
      expect(lastTime).toMatchObject({
        date: "2026-07-19",
        ballName: "IQ Tour",
        stance: 22,
        target: 9,
        average: 190
      });
    });

    it("takes the median, so one stray shot is not the line you remember", () => {
      const frames = [
        frame(1, NONE, undefined, { ball_id: 1, intended: { stance: 20, target: 10 } }),
        frame(2, NONE, undefined, { ball_id: 1, intended: { stance: 20, target: 10 } }),
        // One shot from miles inside.
        frame(3, NONE, undefined, { ball_id: 1, intended: { stance: 40, target: 20 } })
      ];
      const sessions: SessionSummary[] = [
        {
          session: { id: 1, date: "2026-07-19", alley_name: "Sea Bowl" },
          games: [{ ...game(1, 200, 10), frames }]
        }
      ];
      const balls: Ball[] = [{ id: 1, name: "Phaze II", is_spare_ball: false }];
      const { lastTime } = buildBriefing(sessions, balls, {});
      expect(lastTime).toMatchObject({ stance: 20, target: 10 });
    });

    it("still names the night when no line was recorded", () => {
      const sessions = nights(1, "Sea Bowl", 200, 6);
      const { lastTime } = buildBriefing(sessions, NO_BALLS, {});
      expect(lastTime).toMatchObject({ alley: "Sea Bowl", games: 3, average: 200 });
      expect(lastTime?.stance).toBeUndefined();
    });
  });

  it("reports the whole history when nothing is picked", () => {
    const sessions = [
      ...nights(3, "Sea Bowl", 210, 7, { startDay: 1 }),
      ...nights(3, "Palace", 150, 2, { startDay: 10 })
    ];
    const briefing = buildBriefing(sessions, NO_BALLS, {});
    expect(briefing.games).toBe(18);
    // Nothing to compare against, since the slice is everything.
    expect(briefing.callouts.find((c) => c.kind === "expectation")).toBeUndefined();
  });
});

describe("what a rule says it is short of", () => {
  const balls: Ball[] = [
    { id: 1, name: "Phaze II", is_spare_ball: false },
    { id: 2, name: "IQ Tour", is_spare_ball: false }
  ];

  it("counts the qualifying balls, not the balls thrown", () => {
    // One ball, thrown a great many times. The shortfall is a second ball, so
    // reporting 150 against a floor of 20 would read as already satisfied.
    const sessions = [
      ...nights(5, "Sea Bowl", 200, 6, { ballId: 1, startDay: 1 }),
      ...nights(3, "Palace", 150, 3, { startDay: 20 })
    ];
    const { gathering } = buildBriefing(sessions, balls, { alley: "Sea Bowl" });
    expect(gathering).toContainEqual({ kind: "ball", have: 1, need: 2, each: 20 });
  });

  it("counts the qualifying game slots, not the games in one", () => {
    const oneSlot = Array.from({ length: 8 }, (_, i) =>
      session(`2026-06-${String(1 + i).padStart(2, "0")}`, "Sea Bowl", [game(1, 200, 6)])
    );
    const { gathering } = buildBriefing(
      [...oneSlot, ...nights(3, "Palace", 150, 3, { startDay: 20 })],
      NO_BALLS,
      { alley: "Sea Bowl" }
    );
    expect(gathering).toContainEqual({ kind: "gameSlot", have: 1, need: 2, each: 3 });
  });

  it("counts the qualifying lanes, not the games on one", () => {
    const oneLane = Array.from({ length: 3 }, (_, i) =>
      session(`2026-06-${String(1 + i).padStart(2, "0")}`, "Sea Bowl", [
        game(1, 200, 6, { lanes: ["11"] }),
        game(2, 200, 6, { lanes: ["11"] }),
        game(3, 200, 6, { lanes: ["11"] })
      ])
    );
    const { gathering } = buildBriefing(
      [...oneLane, ...nights(3, "Palace", 150, 3, { startDay: 20 })],
      NO_BALLS,
      { alley: "Sea Bowl" }
    );
    expect(gathering).toContainEqual({ kind: "laneBias", have: 1, need: 2, each: 4 });
  });

  it("reports one shortfall, not five, when the slice itself is too thin", () => {
    const sessions = [
      ...nights(1, "Sea Bowl", 200, 6, { startDay: 1 }),
      ...nights(6, "Palace", 150, 3, { startDay: 10 })
    ];
    const { gathering } = buildBriefing(sessions, NO_BALLS, { alley: "Sea Bowl" });
    expect(gathering).toEqual([{ kind: "slice", have: 3, need: 6 }]);
  });
});
