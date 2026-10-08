import { describe, expect, it } from "vitest";
import { bestLines, buildLineReport, findLine, lastSession, lineId, MAX_MOVES, NO_BALL } from "./lineReport";
import type { Ball, Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

const BALLS: Ball[] = [
  { id: 1, name: "Pitch Black", is_spare_ball: false },
  { id: 2, name: "Gem", is_spare_ball: false }
];

type Throw = { stance?: number; target?: number; left?: PinNumber[]; ball?: number; notes?: string };

/** One first ball per frame, on the line given, with a spare behind a leave. */
function game(gameNumber: number, throws: Throw[], lanes = ["7"]): Game & { frames: Frame[] } {
  const frames = throws.map<Frame>((t, i) => {
    const left = t.left ?? [];
    const first: Shot = { pins_standing: left, ball_id: "ball" in t ? t.ball : 1, notes: t.notes };
    if (t.stance !== undefined || t.target !== undefined) {
      first.intended = { stance: t.stance, target: t.target };
    }
    return {
      game_id: gameNumber,
      frame_number: i + 1,
      shots: left.length ? [first, { pins_standing: [] }] : [first],
      is_strike: left.length === 0,
      is_spare: left.length > 0
    };
  });
  return { id: gameNumber, session_id: 1, game_number: gameNumber, lanes, start_lane: lanes[0], frames };
}

function session(
  id: number,
  date: string,
  games: Array<Game & { frames: Frame[] }>,
  extra: { alley?: string; pattern?: string } = {}
): SessionSummary {
  return {
    session: { id, date, alley_name: extra.alley ?? "Club", oil_pattern: extra.pattern },
    games
  };
}

const times = (n: number, t: Throw): Throw[] => Array.from({ length: n }, () => t);

/** The session the feature was asked for: 5 to 7, then a board right at the
 *  stance, with a stray ball on a third line in between. */
const MOVED = session(1, "2026-10-07", [
  game(1, [
    ...times(3, { stance: 5, target: 7 }),
    ...times(3, { stance: 5, target: 7, left: [10] }),
    { stance: 4, target: 6.5, left: [1, 2, 4] }
  ]),
  game(2, [
    ...times(7, { stance: 4, target: 7 }),
    ...times(3, { stance: 4, target: 7, left: [10], notes: "Ringing 10" })
  ])
]);

describe("lines at an alley", () => {
  it("counts each exact line on its own, most thrown first", () => {
    const report = buildLineReport([MOVED], BALLS, {});
    expect(report.shots).toBe(17);
    expect(report.sessions).toBe(1);
    const [ball] = report.balls;
    expect(ball).toMatchObject({ name: "Pitch Black", thrown: 17, strikes: 10 });
    expect(ball.lines.map((l) => [l.stance, l.target, l.strikes, l.thrown])).toEqual([
      [4, 7, 7, 10],
      [5, 7, 3, 6],
      [4, 6.5, 0, 1]
    ]);
  });

  it("reads pocket and carry from the same balls as strikes", () => {
    const line = findLine(buildLineReport([MOVED], BALLS, {}), lineId(1, 4, 7))!;
    expect(line).toMatchObject({ pocket: 10, pocketStrikes: 7, thin: false });
    // A headpin left standing is a miss by the pocket rule.
    expect(findLine(buildLineReport([MOVED], BALLS, {}), lineId(1, 4, 6.5))).toMatchObject({
      pocket: 0,
      thin: true
    });
  });

  it("keeps what a line left and the shots behind it", () => {
    const line = findLine(buildLineReport([MOVED], BALLS, {}), lineId(1, 4, 7))!;
    expect(line.leaves).toEqual([{ pins: [10], count: 3 }]);
    expect(line.shots).toHaveLength(10);
    expect(line.shots[9]).toMatchObject({ gameNumber: 2, frameNumber: 10, notes: "Ringing 10" });
  });

  it("reads back a line change with both sides counted in that session", () => {
    const { moves } = buildLineReport([MOVED], BALLS, {});
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      ballName: "Pitch Black",
      date: "2026-10-07",
      from: { stance: 5, target: 7, strikes: 3, thrown: 6 },
      to: { stance: 4, target: 7, strikes: 7, thrown: 10 }
    });
  });

  it("does not read a change between two balls as a move", () => {
    const two = session(1, "2026-10-07", [
      game(1, [...times(5, { stance: 5, target: 7 }), ...times(5, { stance: 20, target: 15, ball: 2 })])
    ]);
    const report = buildLineReport([two], BALLS, {});
    expect(report.moves).toEqual([]);
    expect(report.balls.map((b) => b.name)).toEqual(["Pitch Black", "Gem"]);
  });

  it("adds a line up across sessions, newest shots first, and caps the moves", () => {
    const many = Array.from({ length: MAX_MOVES + 2 }, (_, i) =>
      session(i + 1, `2026-09-${String(i + 1).padStart(2, "0")}`, [
        game(1, [...times(4, { stance: 5, target: 7 }), ...times(4, { stance: 4, target: 7 })])
      ])
    );
    const report = buildLineReport(many, BALLS, {});
    expect(report.moves).toHaveLength(MAX_MOVES);
    expect(report.moves[0].date).toBe("2026-09-08");
    const line = findLine(report, lineId(1, 5, 7))!;
    expect(line.shots).toHaveLength(32);
    expect(line.shots[0].date).toBe("2026-09-08");
  });

  it("narrows to the alley, the pattern and the lane picked", () => {
    const pair = game(1, times(10, { stance: 5, target: 7 }), ["7", "8"]);
    const sessions = [
      session(1, "2026-10-07", [pair], { pattern: "Chromium" }),
      session(2, "2026-10-06", [game(1, times(3, { stance: 9, target: 9 }))], { alley: "Elsewhere" }),
      session(3, "2026-10-05", [game(1, times(2, { stance: 8, target: 8 }))])
    ];
    expect(buildLineReport(sessions, BALLS, { alley: "Club" }).shots).toBe(12);
    expect(buildLineReport(sessions, BALLS, { alley: "Club", pattern: "Chromium" }).shots).toBe(10);
    // Odd frames of a pair are on the start lane.
    const lane = buildLineReport(sessions, BALLS, { alley: "Club", pattern: "Chromium", lane: "8" });
    expect(lane.shots).toBe(5);
    expect(lane.balls[0].lines[0].shots.every((s) => s.lane === "8")).toBe(true);
  });

  it("counts a ball with no board for the ball, under no line", () => {
    const bare = session(1, "2026-10-07", [
      game(1, [{}, { target: 7 }, { stance: 5, target: 7, ball: undefined }])
    ]);
    const report = buildLineReport([bare], BALLS, {});
    const named = report.balls.find((b) => b.name === "Pitch Black")!;
    expect(named.thrown).toBe(2);
    expect(named.lines.map((l) => [l.stance, l.target])).toEqual([[undefined, 7]]);
    expect(report.balls.find((b) => b.name === NO_BALL)!.lines[0].id).toBe(lineId(undefined, 5, 7));
    expect(report.moves).toEqual([]);
  });

  it("finds nothing for an id it does not hold", () => {
    const report = buildLineReport([MOVED], BALLS, {});
    expect(findLine(report, null)).toBeNull();
    expect(findLine(report, "9_1_1")).toBeNull();
  });
});

describe("the top of the report", () => {
  it("names the lines that struck most per ball, and never a thin one", () => {
    const report = buildLineReport([MOVED], BALLS, {});
    // 4 to 7 struck 7 of 10 and 5 to 7 struck 3 of 6; 4 to 6.5 is one ball.
    expect(bestLines(report).map((l) => [l.stance, l.target])).toEqual([
      [4, 7],
      [5, 7]
    ]);
  });

  it("ranks by the rate, so ten balls and seven strikes beat six and three", () => {
    const report = buildLineReport(
      [session(1, "2026-10-01", [game(1, [...times(5, { stance: 1, target: 1 }), ...times(10, { stance: 2, target: 2, left: [10] })])])],
      BALLS,
      {}
    );
    expect(bestLines(report)[0]).toMatchObject({ stance: 1, target: 1 });
  });

  it("caps at three lines", () => {
    const throws = [1, 2, 3, 4].flatMap((n) => times(5, { stance: n, target: n }));
    const report = buildLineReport([session(1, "2026-10-01", [game(1, throws)])], BALLS, {});
    expect(bestLines(report)).toHaveLength(3);
  });
});

describe("the last session here", () => {
  const OLDER = session(0, "2026-09-01", [game(1, times(5, { stance: 9, target: 9 }))]);

  it("is the newest session's lines, counted inside that session only", () => {
    const last = lastSession(buildLineReport([OLDER, MOVED], BALLS, {}))!;
    expect(last.date).toBe("2026-10-07");
    expect(last.lines.map((l) => [l.line.stance, l.line.target, l.thrown, l.strikes])).toEqual([
      [4, 7, 10, 7],
      [5, 7, 6, 3],
      [4, 6.5, 1, 0]
    ]);
  });

  it("is nothing when there is nothing recorded", () => {
    expect(lastSession(buildLineReport([], BALLS, {}))).toBeNull();
  });
});
