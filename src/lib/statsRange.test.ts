import { describe, expect, it } from "vitest";
import {
  calculateRecentForm,
  FORM_MIN_SESSIONS,
  LAST_SESSIONS,
  sessionsInRange,
  windowStart
} from "./statsRange";
import type { Game, SessionSummary } from "../types/bowling";

function game(score: number | undefined, lanes: string[] = ["5", "6"]): Game & { frames: [] } {
  return { id: 1, session_id: 1, game_number: 1, final_score: score, lanes, frames: [] };
}

function night(date: string, scores: Array<number | undefined>, lanes?: string[]): SessionSummary {
  return { session: { date, alley_name: "Sea Bowl" }, games: scores.map((s) => game(s, lanes)) };
}

/** `n` nights a week apart from 1 January, each with the scores `scoreOf` gives. */
function nights(n: number, scoreOf: (i: number) => number): SessionSummary[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString().slice(0, 10);
    return night(d, [scoreOf(i)]);
  });
}

describe("windowStart", () => {
  it("counts back the given number of days", () => {
    expect(windowStart("2026-10-10", 90)).toBe("2026-07-12");
  });

  it("crosses a year end", () => {
    expect(windowStart("2027-01-15", 90)).toBe("2026-10-17");
  });
});

describe("sessionsInRange", () => {
  it("keeps everything on All", () => {
    const all = nights(12, () => 200);
    expect(sessionsInRange(all, "all", "2026-10-09")).toBe(all);
  });

  it("keeps the last 90 days, the first of them included", () => {
    const all = [night("2026-07-11", [180]), night("2026-07-12", [200]), night("2026-10-09", [210])];
    expect(sessionsInRange(all, "months3", "2026-10-10").map((s) => s.session.date)).toEqual([
      "2026-07-12",
      "2026-10-09"
    ]);
  });

  it("keeps the last ten scored sessions, oldest first, whatever order they came in", () => {
    const all = nights(14, () => 200).reverse();
    const kept = sessionsInRange(all, "last10", "2026-10-09");
    expect(kept).toHaveLength(LAST_SESSIONS);
    expect(kept[0].session.date).toBe(nights(14, () => 200)[4].session.date);
    expect(kept[9].session.date).toBe(nights(14, () => 200)[13].session.date);
  });

  it("does not give a slot to a session with nothing finished", () => {
    const all = [...nights(10, () => 200), night("2026-12-30", [undefined])];
    const kept = sessionsInRange(all, "last10", "2026-12-31");
    expect(kept.map((s) => s.session.date)).not.toContain("2026-12-30");
    expect(kept).toHaveLength(10);
  });

  it("counts only nights bowled on the lanes being read", () => {
    const all = [...nights(10, () => 200), night("2026-12-30", [190], ["1", "2"])];
    const kept = sessionsInRange(all, "last10", "2026-12-31", ["5"]);
    expect(kept.map((s) => s.session.date)).not.toContain("2026-12-30");
  });
});

describe("calculateRecentForm", () => {
  it("says nothing until there are enough sessions to compare against", () => {
    const few = nights(FORM_MIN_SESSIONS - 1, () => 200);
    expect(calculateRecentForm(few, 200)).toBeNull();
    expect(calculateRecentForm([], null)).toBeNull();
  });

  it("reads the last five sessions as a game average against the whole", () => {
    // Ten nights at 180, then five at 210: the whole averages 190.
    const all = nights(15, (i) => (i < 10 ? 180 : 210));
    expect(calculateRecentForm(all, 190)).toEqual({ average: 210, difference: 20 });
  });

  it("can be under the average, and is not hidden for it", () => {
    const all = nights(12, (i) => (i < 7 ? 200 : 170));
    expect(calculateRecentForm(all, 187)).toEqual({ average: 170, difference: -17 });
  });
});
