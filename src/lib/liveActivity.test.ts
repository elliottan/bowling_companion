import { afterEach, describe, expect, it } from "vitest";
import { buildLiveActivityState, currentAppearance, hasRecordedBall, maxPossibleScore } from "./liveActivity";
import { calculateGameScore } from "./scoring";
import type { Frame, PinNumber, Shot } from "../types/bowling";

function frame(n: number, shot1: PinNumber[], shot2?: PinNumber[], shot3?: PinNumber[]): Frame {
  const shots: Shot[] = [{ pins_standing: shot1 }];
  if (shot2 !== undefined) shots.push({ pins_standing: shot2 });
  if (shot3 !== undefined) shots.push({ pins_standing: shot3 });
  return { game_id: 1, frame_number: n, shots, is_strike: shot1.length === 0, is_spare: false };
}

const strikes = (count: number): Frame[] => Array.from({ length: count }, (_, i) => frame(i + 1, []));
const SESSION = { alley_name: "Sunset Lanes", description: "Tuesday league" };
const GAME = { game_number: 3 };

describe("buildLiveActivityState", () => {
  it("has nothing to show before the first ball", () => {
    expect(buildLiveActivityState(SESSION, GAME, [])).toBeNull();
    expect(hasRecordedBall([])).toBe(false);
  });

  it("draws the card's own marks and its running totals", () => {
    // Frame 1 a strike, frame 2 a 7 then a spare, frame 3 a 9 then a miss of 1.
    const frames = [
      frame(1, []),
      frame(2, [3 as PinNumber, 5 as PinNumber, 9 as PinNumber], []),
      frame(3, [10 as PinNumber], [10 as PinNumber])
    ];
    const state = buildLiveActivityState(SESSION, GAME, frames)!;
    expect(state.frames).toHaveLength(10);
    expect(state.frames[0].marks).toEqual(["", "X"]);
    expect(state.frames[1].marks).toEqual(["7", "/"]);
    expect(state.frames[2].marks).toEqual(["9", "-"]);
    expect(state.frames[3].marks).toEqual(["", ""]);
    // Strike 10 + 7 + 3, then the spare 10 + 9, then the open 9.
    expect(state.frames.slice(0, 3).map((f) => f.score)).toEqual(["20", "39", "48"]);
    expect(state.frames[3].score).toBe("");
    expect(state.total).toBe(48);
    expect(state.total).toBe(calculateGameScore(frames).total);
  });

  it("holds back a frame's total until it is settled, as the card does", () => {
    const state = buildLiveActivityState(SESSION, GAME, [frame(1, [10 as PinNumber])])!;
    expect(state.frames[0].marks).toEqual(["9", ""]);
    expect(state.frames[0].score).toBe("");
    expect(state.frame).toBe(1);
  });

  it("follows the frame being bowled", () => {
    expect(buildLiveActivityState(SESSION, GAME, strikes(4))!.frame).toBe(5);
    // Mid-frame, the first ball down: still that frame.
    expect(buildLiveActivityState(SESSION, GAME, [...strikes(2), frame(3, [10 as PinNumber])])!.frame).toBe(3);
  });

  it("names the session by its event and the centre as the location", () => {
    const state = buildLiveActivityState(SESSION, GAME, strikes(1))!;
    expect(state.label).toBe("Tuesday league");
    expect(state.location).toBe("Sunset Lanes");
    expect(state.game).toBe(3);
  });

  it("uses the alley as the label when the session has no event, and does not repeat it", () => {
    const state = buildLiveActivityState({ alley_name: "Sunset Lanes" }, GAME, strikes(1))!;
    expect(state.label).toBe("Sunset Lanes");
    expect(state.location).toBe("");
  });

  it("copes with a session named nothing at all", () => {
    const state = buildLiveActivityState({ alley_name: "  " }, GAME, strikes(1))!;
    expect(state.label).toBe("Unnamed session");
    expect(state.location).toBe("");
  });

  it("keeps a long name to one line's worth", () => {
    const state = buildLiveActivityState({ alley_name: "x", description: "y".repeat(100) }, GAME, strikes(1))!;
    expect(state.label.length).toBeLessThanOrEqual(40);
    expect(state.label.endsWith("…")).toBe(true);
  });

  it("reports the highest score still possible", () => {
    // A strike and a 9 miss-spare: the best from here is strikes all the way.
    const state = buildLiveActivityState(SESSION, GAME, strikes(1))!;
    expect(state.max).toBe(300);
    expect(state.done).toBe(false);
    // An open frame costs the perfect game: 9 then a miss caps it below 300.
    const open = buildLiveActivityState(SESSION, GAME, [frame(1, [10 as PinNumber], [10 as PinNumber])])!;
    expect(open.max).toBeLessThan(300);
  });

  it("shows the tenth frame's three boxes and the finished game's final score", () => {
    const frames = [...strikes(9), frame(10, [], [], [])];
    const state = buildLiveActivityState(SESSION, GAME, frames)!;
    expect(state.done).toBe(true);
    expect(state.max).toBeNull();
    expect(state.frame).toBe(10);
    expect(state.total).toBe(300);
    expect(state.frames[9].marks).toEqual(["X", "X", "X"]);
    expect(state.frames[9].score).toBe("300");
    expect(state.frames[8].score).toBe("270");
  });

  it("shows the running total in the tenth while it is still being bowled", () => {
    const frames = [...strikes(9), frame(10, [])];
    const state = buildLiveActivityState(SESSION, GAME, frames)!;
    expect(state.done).toBe(false);
    expect(state.frame).toBe(10);
    expect(state.frames[9].marks).toEqual(["X", "", ""]);
    expect(state.frames[9].score).toBe(String(state.total));
  });

  it("stays well under ActivityKit's 4 KB", () => {
    const frames = [...strikes(9), frame(10, [], [], [])];
    const long = { alley_name: "a".repeat(100), description: "b".repeat(100) };
    const bytes = new TextEncoder().encode(JSON.stringify(buildLiveActivityState(long, GAME, frames))).length;
    expect(bytes).toBeLessThan(1500);
  });
});

describe("maxPossibleScore", () => {
  it("is 300 for a game with nothing but strikes so far", () => {
    expect(maxPossibleScore(strikes(5))).toBe(300);
  });

  it("is the total itself once the game is over", () => {
    const frames = [...strikes(9), frame(10, [], [], [])];
    expect(maxPossibleScore(frames)).toBe(300);
  });

  it("drops by what an open frame gives away", () => {
    // A 9 then a gutter in frame 1, and strikes after, scored by the engine.
    const open = [frame(1, [10 as PinNumber], [10 as PinNumber])];
    const best = [...open, ...Array.from({ length: 8 }, (_, i) => frame(i + 2, [])), frame(10, [], [], [])];
    expect(maxPossibleScore(open)).toBe(calculateGameScore(best).total);
  });

  it("finishes a half-bowled frame with a spare", () => {
    // 7 down, three standing: the best is a spare, then strikes.
    const half = [frame(1, [4 as PinNumber, 5 as PinNumber, 6 as PinNumber])];
    const best = [
      frame(1, [4 as PinNumber, 5 as PinNumber, 6 as PinNumber], []),
      ...Array.from({ length: 8 }, (_, i) => frame(i + 2, [])),
      frame(10, [], [], [])
    ];
    expect(maxPossibleScore(half)).toBe(calculateGameScore(best).total);
  });
});

describe("the Live Activity's colors", () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette;
    localStorage.removeItem("theme");
  });

  it("carries the palette and theme it is given", () => {
    const state = buildLiveActivityState(SESSION, GAME, strikes(1), { palette: "grape", theme: "dark" })!;
    expect(state.palette).toBe("grape");
    expect(state.theme).toBe("dark");
  });

  it("defaults to Felt following the phone", () => {
    const state = buildLiveActivityState(SESSION, GAME, strikes(1))!;
    expect(state.palette).toBe("felt");
    expect(state.theme).toBe("system");
  });

  it("reads the palette the app is showing and the theme the bowler chose", () => {
    document.documentElement.dataset.palette = "ocean";
    localStorage.setItem("theme", "light");
    expect(currentAppearance()).toEqual({ palette: "ocean", theme: "light" });
  });

  it("reads Felt when no palette is on the page, or an unknown one", () => {
    expect(currentAppearance().palette).toBe("felt");
    document.documentElement.dataset.palette = "mauve";
    expect(currentAppearance().palette).toBe("felt");
  });
});
