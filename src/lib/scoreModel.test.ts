import { describe, expect, it } from "vitest";
import {
  SpareBook,
  THIN_LEAVE_CHANCES,
  buildModel,
  estimateBalls,
  expectedGameScore,
  leaveKind,
  readGames,
  type FrameModel
} from "./scoreModel";
import { calculateGameScore } from "./scoring";
import type { Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

const NONE: PinNumber[] = [];
const TEN: PinNumber[] = [10];
const SPLIT: PinNumber[] = [7, 10];

/** A frame whose shots carry a ball id, so a game can be thrown with two. */
function frame(n: number, ball: number, ...standing: PinNumber[][]): Frame {
  const shots: Shot[] = standing.map((pins_standing) => ({ pins_standing, ball_id: ball }));
  return {
    game_id: 1,
    frame_number: n,
    shots,
    is_strike: standing[0].length === 0,
    is_spare: standing[0].length > 0 && standing[1]?.length === 0
  };
}

function game(frames: Frame[]): Game & { frames: Frame[] } {
  const score = calculateGameScore(frames).total;
  return { id: 1, session_id: 1, game_number: 1, final_score: score ?? undefined, frames };
}

function sessions(...games: Array<Game & { frames: Frame[] }>): SessionSummary[] {
  return [{ session: { date: "2026-06-07", alley_name: "Sea Bowl" }, games }];
}

/** Ten frames of the same first ball and spare ball, by one ball. */
function sameEveryFrame(ball: number, first: PinNumber[], second: PinNumber[]): Frame[] {
  return Array.from({ length: 10 }, (_, i) =>
    i < 9
      ? frame(i + 1, ball, first, second)
      : second.length === 0
        ? frame(10, ball, first, second, first)
        : frame(10, ball, first, second)
  );
}

const nines = (makeRate: number, pinsOnMiss = 0): FrameModel => ({
  strikeAfterStrike: 0,
  strikeOtherwise: 0,
  leaves: [{ standing: 1, weight: 1, makeRate, pinsOnMiss }]
});

describe("expectedGameScore", () => {
  it("plays a perfect game to 300", () => {
    expect(expectedGameScore({ strikeAfterStrike: 1, strikeOtherwise: 1, leaves: [] })).toBeCloseTo(300);
  });

  it("plays nine and a spare every frame to 190, and nine and a miss to 90", () => {
    expect(expectedGameScore(nines(1))).toBeCloseTo(190);
    expect(expectedGameScore(nines(0))).toBeCloseTo(90);
  });

  it("is linear in a make rate: half the spares made lands halfway", () => {
    expect(expectedGameScore(nines(0.5))).toBeGreaterThan(90);
    expect(expectedGameScore(nines(0.5))).toBeLessThan(190);
  });

  it("scores strike on strike, not just strikes: the same strikes strung or not", () => {
    // Strike, then a nine-spare, then a strike: every strike is followed by a
    // miss of the next rack. X 9/ X 9/ ... with a 9/X tenth is 200.
    const alternating = {
      strikeAfterStrike: 0,
      strikeOtherwise: 1,
      leaves: [{ standing: 1, weight: 1, makeRate: 1, pinsOnMiss: 0 }]
    };
    expect(expectedGameScore(alternating)).toBeCloseTo(200);
    // Half the first balls strike either way, but strung together they score more.
    const strung = { ...alternating, strikeAfterStrike: 0.75, strikeOtherwise: 0.25 };
    const independent = { ...alternating, strikeAfterStrike: 0.5, strikeOtherwise: 0.5 };
    const broken = { ...alternating, strikeAfterStrike: 0.25, strikeOtherwise: 0.75 };
    expect(expectedGameScore(strung)).toBeGreaterThan(expectedGameScore(independent));
    expect(expectedGameScore(independent)).toBeGreaterThan(expectedGameScore(broken));
  });

  it("counts the pins a missed spare still knocks down", () => {
    expect(expectedGameScore({ ...nines(0), leaves: [{ standing: 3, weight: 1, makeRate: 0, pinsOnMiss: 2 }] }))
      .toBeCloseTo(10 * 9);
  });
});

describe("the spare book", () => {
  it("rates every leave on its own once it has enough chances", () => {
    const book = new SpareBook();
    for (let i = 0; i < 20; i++) book.record(TEN, i < 18, 0);
    const rate = book.rate(TEN);
    expect(rate.chances).toBe(20);
    expect(rate.thin).toBe(false);
    // Twenty chances against five imagined ones: mostly the leave's own 90%.
    expect(rate.makeRate).toBeGreaterThan(0.88);
  });

  it("flags a leave with few chances, and leans it on its kind", () => {
    const book = new SpareBook();
    for (let i = 0; i < 30; i++) book.record([7], true, 0);
    book.record([4], false, 0);
    const four = book.rate([4]);
    expect(four.thin).toBe(true);
    expect(four.chances).toBe(1);
    // One miss is not a 0% leave: other single pins say it is usually made.
    expect(four.makeRate).toBeGreaterThan(0.6);
  });

  it("keeps splits apart from makeable leaves", () => {
    expect(leaveKind([10])).toBe("single");
    expect(leaveKind([6, 10])).toBe("makeable");
    expect(leaveKind([3, 10])).toBe("makeable"); // a baby split
    expect(leaveKind(SPLIT)).toBe("split");
    expect(leaveKind([1, 2, 10])).toBe("split"); // a washout
  });

  it("calls a leave thin below the threshold", () => {
    const book = new SpareBook();
    for (let i = 0; i < THIN_LEAVE_CHANCES - 1; i++) book.record(TEN, true, 0);
    expect(book.rate(TEN).thin).toBe(true);
    book.record(TEN, true, 0);
    expect(book.rate(TEN).thin).toBe(false);
  });
});

describe("reading games", () => {
  it("reproduces a game bowled the same way every frame", () => {
    const games = Array.from({ length: 6 }, () => game(sameEveryFrame(1, TEN, NONE)));
    const { all, spares, games: scores } = readGames(sessions(...games));
    expect(scores.every((s) => s === 190)).toBe(true);
    // Not exactly 190: sixty makes in sixty still lean a little on what single
    // pins are usually worth.
    expect(expectedGameScore(buildModel(all, spares).model)).toBeCloseTo(190, 0);
  });

  it("splits fresh-rack balls by whether the ball before them struck", () => {
    // X 9/ X 9/ ...: every strike is followed by a non-strike.
    const frames = Array.from({ length: 10 }, (_, i) =>
      i === 9 ? frame(10, 1, TEN, NONE, NONE) : i % 2 === 0 ? frame(i + 1, 1, NONE) : frame(i + 1, 1, TEN, NONE)
    );
    const { all } = readGames(sessions(game(frames)));
    expect(all.afterStrike.strikes).toBe(0);
    expect(all.afterStrike.balls).toBeGreaterThan(0);
    expect(all.otherwise.strikes).toBe(all.otherwise.balls);
  });

  it("matches a real mixed game within a few pins", () => {
    // Strikes, spares, a split and an open, by one ball, repeated.
    const frames = [
      frame(1, 1, NONE),
      frame(2, 1, NONE),
      frame(3, 1, TEN, NONE),
      frame(4, 1, SPLIT, [7]),
      frame(5, 1, NONE),
      frame(6, 1, [2, 4, 5], NONE),
      frame(7, 1, TEN, TEN),
      frame(8, 1, NONE),
      frame(9, 1, [4], NONE),
      frame(10, 1, NONE, NONE, TEN)
    ];
    const games = Array.from({ length: 10 }, () => game(frames));
    const result = estimateBalls(sessions(...games));
    expect(result.actual).not.toBeNull();
    expect(Math.abs(result.baseline - (result.actual as number))).toBeLessThan(15);
  });
});

describe("estimating each ball", () => {
  it("rates leaves from the whole history, whatever the scope", () => {
    // In scope the 10 pin was missed once; across the history it is made.
    const missed = game(sameEveryFrame(1, TEN, TEN));
    const made = Array.from({ length: 6 }, () => game(sameEveryFrame(1, TEN, NONE)));
    const scopeOnly = estimateBalls(sessions(missed));
    const withHistory = estimateBalls(sessions(missed), { history: sessions(missed, ...made) });
    expect(withHistory.baseline).toBeGreaterThan(scopeOnly.baseline + 50);
  });

  it("costs a ball the splits it leaves, at the bowler's own make rate", () => {
    // Two balls that strike equally often. One leaves the 10 pin, the other
    // the 7-10, and the bowler makes one and not the other.
    const singles = Array.from({ length: 8 }, () =>
      game(Array.from({ length: 10 }, (_, i) => (i === 9 ? frame(10, 1, NONE, NONE, NONE) : i % 2 ? frame(i + 1, 1, TEN, NONE) : frame(i + 1, 1, NONE))))
    );
    const splits = Array.from({ length: 8 }, () =>
      game(Array.from({ length: 10 }, (_, i) => (i === 9 ? frame(10, 2, NONE, NONE, NONE) : i % 2 ? frame(i + 1, 2, SPLIT, [7]) : frame(i + 1, 2, NONE))))
    );
    const { balls } = estimateBalls(sessions(...singles, ...splits));
    const tenPin = balls.find((b) => b.ballId === 1)!;
    const sevenTen = balls.find((b) => b.ballId === 2)!;
    expect(tenPin.leaveMakeRate).toBeGreaterThan(sevenTen.leaveMakeRate);
    expect(tenPin.difference).toBeGreaterThan(0);
    expect(sevenTen.difference).toBeLessThan(0);
    expect(tenPin.estimate! - sevenTen.estimate!).toBeGreaterThan(10);
  });

  it("splits a ball's difference into its strikes and its leaves, exactly", () => {
    const singles = Array.from({ length: 8 }, () => game(sameEveryFrame(1, NONE, NONE)));
    const splits = Array.from({ length: 8 }, () => game(sameEveryFrame(2, SPLIT, [7])));
    for (const b of estimateBalls(sessions(...singles, ...splits)).balls) {
      expect(b.fromStrikes + b.fromLeaves).toBeCloseTo(b.difference, 6);
    }
  });

  it("counts the leaves a ball's spares picked up, splits included", () => {
    const singles = Array.from({ length: 4 }, () => game(sameEveryFrame(1, TEN, NONE)));
    const splits = Array.from({ length: 4 }, () => game(sameEveryFrame(2, SPLIT, [7])));
    const { balls, counted } = estimateBalls(sessions(...singles, ...splits));
    const tenPin = balls.find((b) => b.ballId === 1)!.counted;
    const sevenTen = balls.find((b) => b.ballId === 2)!.counted;
    expect(tenPin.pickups).toBe(tenPin.pickupChances);
    expect(sevenTen.pickups).toBe(0);
    expect(counted.pickupChances).toBe(tenPin.pickupChances + sevenTen.pickupChances);
  });

  it("names the leaves a ball costs most, and leaves out the ones always made", () => {
    const frames = (ball: number) =>
      Array.from({ length: 10 }, (_, i) =>
        i === 9
          ? frame(10, ball, TEN, NONE, NONE)
          : i % 3 === 0
            ? frame(i + 1, ball, SPLIT, [7])
            : frame(i + 1, ball, TEN, NONE)
      );
    const { balls } = estimateBalls(sessions(...Array.from({ length: 6 }, () => game(frames(1)))));
    const [first, ...rest] = balls[0].costliest;
    expect(first.pins).toEqual(SPLIT);
    expect(first.made).toBe(0);
    expect(first.left).toBe(18);
    // Every 10 pin was made, so it costs nothing and is not named.
    expect(rest.find((l) => l.pins.join() === "10")).toBeUndefined();
  });

  it("ranks the balls with enough behind them, and lists the thin ones after", () => {
    const main = Array.from({ length: 10 }, () => game(sameEveryFrame(1, TEN, NONE)));
    const lucky = game([frame(1, 2, NONE), ...sameEveryFrame(1, TEN, NONE).slice(1)]);
    const { balls } = estimateBalls(sessions(...main, lucky));
    expect(balls.map((b) => b.ballId)).toEqual([1, 2]);
    expect(balls[1].thin).toBe(true);
  });

  it("reads a ball with a handful of throws close to the bowler", () => {
    const main = Array.from({ length: 10 }, () => game(sameEveryFrame(1, TEN, NONE)));
    // Three perfect frames with another ball: not a 300 ball.
    const lucky = game([
      frame(1, 2, NONE),
      frame(2, 2, NONE),
      frame(3, 2, NONE),
      ...sameEveryFrame(1, TEN, NONE).slice(3)
    ]);
    const { balls } = estimateBalls(sessions(...main, lucky));
    const two = balls.find((b) => b.ballId === 2)!;
    expect(two.firstBalls).toBe(3);
    expect(two.difference).toBeLessThan(60);
  });
});
